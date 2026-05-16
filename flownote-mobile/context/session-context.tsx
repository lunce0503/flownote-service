import { createContext, useCallback, useContext, useMemo, useState, type PropsWithChildren } from 'react';

import { flownoteApi, type FlownoteUser, type LoginResponse } from '@/lib/flownote-api';

type SessionContextValue = {
  token: string | null;
  user: FlownoteUser | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<LoginResponse>;
  register: (input: {
    username: string;
    email: string;
    password: string;
    nickname: string;
  }) => Promise<FlownoteUser>;
  logout: () => void;
};

const SessionContext = createContext<SessionContextValue | null>(null);

export function SessionProvider({ children }: PropsWithChildren) {
  const [token, setToken] = useState<string | null>(null);
  const [user, setUser] = useState<FlownoteUser | null>(null);
  const [loading, setLoading] = useState(false);

  const login = useCallback(async (email: string, password: string) => {
    setLoading(true);
    try {
      const session = await flownoteApi.login(email.trim(), password);
      setToken(session.token);
      setUser(session.user);
      return session;
    } finally {
      setLoading(false);
    }
  }, []);

  const register = useCallback(
    async (input: { username: string; email: string; password: string; nickname: string }) => {
      setLoading(true);
      try {
        return await flownoteApi.register({
          username: input.username.trim(),
          email: input.email.trim(),
          password: input.password,
          nickname: input.nickname.trim(),
        });
      } finally {
        setLoading(false);
      }
    },
    []
  );

  const logout = useCallback(() => {
    setToken(null);
    setUser(null);
  }, []);

  const value = useMemo(
    () => ({ token, user, loading, login, register, logout }),
    [loading, login, logout, register, token, user]
  );

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export function useSession() {
  const value = useContext(SessionContext);
  if (!value) {
    throw new Error('useSession must be used inside SessionProvider.');
  }

  return value;
}
