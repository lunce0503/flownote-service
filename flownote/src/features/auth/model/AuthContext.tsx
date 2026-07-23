import { createContext, useContext, useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import {
  axios,
  API_CORE_BASE_URL,
  authHeaders,
  clearAuth,
  getAuthToken,
  getAuthUser,
  setAuthToken,
  setAuthUser,
} from "@/shared/api";
import type { AuthUser } from "@/shared/api";

type AuthContextValue = {
  token: string | null;
  user: AuthUser | null;
  isAuthenticated: boolean;
  login: (token: string, user: AuthUser) => void;
  logout: () => void;
};

const AuthContext = createContext<AuthContextValue | null>(null);

// 스테이징 전용 게스트 자동 로그인 설정(빌드 타임 주입).
// 프로덕션 빌드는 VITE_ALLOW_ANONYMOUS를 설정하지 않으므로 anonymousEnabled=false → 동작 무변화.
const anonymousEnabled = import.meta.env.VITE_ALLOW_ANONYMOUS === "true";
const guestEmail = import.meta.env.VITE_GUEST_EMAIL as string | undefined;
const guestPassword = import.meta.env.VITE_GUEST_PASSWORD as string | undefined;
const guestConfigured = anonymousEnabled && Boolean(guestEmail && guestPassword);

const AuthProvider = ({ children }: { children: ReactNode }) => {
  const [token, setToken] = useState<string | null>(() => getAuthToken());
  const [user, setUser] = useState<AuthUser | null>(() => getAuthUser());
  // 게스트 자동 로그인이 필요한 동안(스테이징 + 미인증)에는 자식 렌더를 잠깐 보류해
  // ProtectedRoute가 /login으로 순간 리다이렉트하는 것을 막는다.
  const [bootstrapping, setBootstrapping] = useState(() => guestConfigured && !getAuthToken());

  const logout = () => {
    clearAuth();
    setToken(null);
    setUser(null);
  };

  const login = (nextToken: string, nextUser: AuthUser) => {
    setAuthToken(nextToken);
    setAuthUser(nextUser);
    setToken(nextToken);
    setUser(nextUser);
  };

  // 스테이징: 로그인 없이 접근할 수 있도록 게스트 계정으로 자동 로그인한다.
  // 콜드스타트(잠든 인증 서버)로 첫 요청이 5xx일 수 있어 몇 차례 재시도한다.
  useEffect(() => {
    if (!bootstrapping) return;
    let active = true;
    const autoGuestLogin = async () => {
      if (!API_CORE_BASE_URL) return;
      for (let attempt = 0; attempt < 4 && active; attempt += 1) {
        try {
          const response = await axios.post<{ token: string; user: AuthUser }>(
            `${API_CORE_BASE_URL}/api/users/login`,
            { email: guestEmail, password: guestPassword },
          );
          if (!active) return;
          const { token: nextToken, user: nextUser } = response.data;
          setAuthToken(nextToken);
          setAuthUser(nextUser);
          setToken(nextToken);
          setUser(nextUser);
          return;
        } catch (error) {
          const status = (error as { response?: { status?: number } })?.response?.status;
          // 4xx(자격 오류 등)는 재시도 무의미 — 중단. 5xx/네트워크(콜드스타트)만 재시도.
          if (status && status < 500) {
            console.warn("게스트 자동 로그인 실패(재시도 안 함):", status);
            return;
          }
          await new Promise((resolve) => setTimeout(resolve, 1500));
        }
      }
    };
    void autoGuestLogin().finally(() => {
      if (active) setBootstrapping(false);
    });
    return () => { active = false; };
  }, [bootstrapping]);

  useEffect(() => {
    const interceptorId = axios.interceptors.response.use(
      (response) => response,
      (error) => {
        if (error.response?.status === 401) {
          logout();
          if (guestConfigured) {
            // 스테이징: /login 대신 게스트로 다시 로그인한다(막다른 로그인 화면 방지).
            setBootstrapping(true);
          } else if (window.location.pathname !== "/login") {
            window.location.assign("/login");
          }
        }

        return Promise.reject(error);
      },
    );

    return () => {
      axios.interceptors.response.eject(interceptorId);
    };
  }, []);

  useEffect(() => {
    if (!token || !API_CORE_BASE_URL) return;
    let active = true;
    void axios.get<AuthUser>(`${API_CORE_BASE_URL}/api/users/me`, { headers: authHeaders() })
      .then((response) => {
        if (!active) return;
        setAuthUser(response.data);
        setUser(response.data);
      })
      .catch(() => {
        // The response interceptor handles expired sessions.
      });
    return () => {
      active = false;
    };
  }, [token]);

  const value = useMemo(
    () => ({
      token,
      user,
      isAuthenticated: Boolean(token && user),
      login,
      logout,
    }),
    [token, user],
  );

  return (
    <AuthContext.Provider value={value}>
      {bootstrapping ? (
        <div className="flex min-h-screen w-full items-center justify-center bg-[#242424] text-sm text-slate-300">
          게스트로 접속 중…
        </div>
      ) : (
        children
      )}
    </AuthContext.Provider>
  );
};

const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within AuthProvider.");
  }

  return context;
};

export { AuthProvider, useAuth };
