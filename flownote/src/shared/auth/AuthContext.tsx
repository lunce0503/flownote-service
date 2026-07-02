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
} from "../api";
import type { AuthUser } from "../api";

type AuthContextValue = {
  token: string | null;
  user: AuthUser | null;
  isAuthenticated: boolean;
  login: (token: string, user: AuthUser) => void;
  logout: () => void;
};

const AuthContext = createContext<AuthContextValue | null>(null);

const AuthProvider = ({ children }: { children: ReactNode }) => {
  const [token, setToken] = useState<string | null>(() => getAuthToken());
  const [user, setUser] = useState<AuthUser | null>(() => getAuthUser());

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

  useEffect(() => {
    const interceptorId = axios.interceptors.response.use(
      (response) => response,
      (error) => {
        if (error.response?.status === 401) {
          logout();
          if (window.location.pathname !== "/login") {
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

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within AuthProvider.");
  }

  return context;
};

export { AuthProvider, useAuth };
