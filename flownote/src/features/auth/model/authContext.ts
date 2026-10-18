import { createContext, useContext } from "react";
import type { AuthUser } from "@/shared/api";

export type AuthContextValue = {
  token: string | null;
  user: AuthUser | null;
  isAuthenticated: boolean;
  login: (token: string, user: AuthUser) => void;
  logout: () => void;
  updateProfile: (input: { username: string; email: string; nickname: string; currentPassword?: string }) => Promise<void>;
};

export const AuthContext = createContext<AuthContextValue | null>(null);

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within AuthProvider.");
  }
  return context;
};
