import { useCallback, useEffect, useMemo, useState } from "react";
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
import { noteDrafts } from "@/entities/blog";
import { AuthContext } from "./authContext";
import { isDeviceOnly } from '@/shared/lib/deviceMode';

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

  const resetAuth = useCallback(() => {
    clearAuth();
    setToken(null);
    setUser(null);
  }, []);

  const logout = useCallback(async () => {
    if (isDeviceOnly()) {
      if (!window.confirm('기기 자료는 이 계정의 기기 저장소에 남습니다. 공유 기기라면 백업 후 앱/사이트 데이터를 별도로 정리하세요. 로그아웃할까요?')) return;
      resetAuth(); window.location.assign('/login'); return;
    }
    const owner = getAuthUser()?.id;
    const hasDrafts = owner ? await noteDrafts.hasUser(owner).catch(() => true) : false;
    if (hasDrafts && !window.confirm("로그아웃하면 이 계정의 기기 초안을 삭제합니다. 필요한 입력을 내보낸 뒤 계속할까요?")) return;
    await axios.post(`${API_CORE_BASE_URL}/api/users/logout`, {}, { headers: authHeaders() });
    if (owner) await noteDrafts.clearUser(owner).catch(() => {
      window.alert("로그아웃했습니다. 기기 초안 정리에 실패했습니다. 공유 기기에서는 브라우저 사이트 데이터를 삭제하세요.");
    });
    resetAuth();
    window.location.assign("/login");
  }, [resetAuth]);

  const login = (nextToken: string, nextUser: AuthUser) => {
    setAuthToken();
    setAuthUser(nextUser);
    setToken(nextToken);
    setUser(nextUser);
  };

  const updateProfile = async (input: { username: string; email: string; nickname: string; currentPassword?: string }) => {
    const { currentPassword, ...profile } = input;
    const response = await axios.patch<AuthUser>(`${API_CORE_BASE_URL}/api/users/me`, { ...profile, current_password: currentPassword }, { headers: authHeaders() });
    setAuthUser(response.data);
    setUser(response.data);
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
          setAuthToken();
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
          resetAuth();
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
  }, [resetAuth]);

  useEffect(() => {
    if (!token || !API_CORE_BASE_URL || isDeviceOnly()) return;
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
      updateProfile,
    }),
    [token, user, logout],
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

export { AuthProvider };
