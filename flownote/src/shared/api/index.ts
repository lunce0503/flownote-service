import axios from "axios";
import { requireBrowserReachableUrl, resolveBrowserReachableUrl } from "./cloudUrl";

const API_BASE_URL = requireBrowserReachableUrl("VITE_API_BASE_URL", import.meta.env.VITE_API_BASE_URL);
const API_BASE_URL2 = resolveBrowserReachableUrl(import.meta.env.VITE_API_BASE_URL2) ?? API_BASE_URL;
const API_CORE_BASE_URL = resolveBrowserReachableUrl(import.meta.env.VITE_CORE_API_URL) ?? API_BASE_URL2;
const API_AI_BASE_URL = resolveBrowserReachableUrl(import.meta.env.VITE_AI_BASE_URL) ?? API_BASE_URL;
// Sync now lives on the gateway; obsolete Next/SSE configuration is ignored.
const API_SYNC_BASE_URL = resolveBrowserReachableUrl(import.meta.env.VITE_CANVAS_SOCKET_URL) ?? API_BASE_URL;
const AUTH_TOKEN_KEY = "flownote_auth_token";
const AUTH_USER_KEY = "flownote_auth_user";

type AuthUser = {
  id: string;
  username: string;
  email: string;
  nickname: string;
  role?: "USER" | "ADMIN";
};

const DEFAULT_HEADERS = {
  "Content-Type": "application/json",
};

const getAuthToken = () => localStorage.getItem(AUTH_TOKEN_KEY);

const setAuthToken = (token: string) => {
  localStorage.setItem(AUTH_TOKEN_KEY, token);
};

const getAuthUser = (): AuthUser | null => {
  const storedUser = localStorage.getItem(AUTH_USER_KEY);
  if (!storedUser) return null;

  try {
    return JSON.parse(storedUser) as AuthUser;
  } catch {
    localStorage.removeItem(AUTH_USER_KEY);
    return null;
  }
};

const setAuthUser = (user: AuthUser) => {
  localStorage.setItem(AUTH_USER_KEY, JSON.stringify(user));
};

const clearAuthToken = () => {
  localStorage.removeItem(AUTH_TOKEN_KEY);
};

const clearAuth = () => {
  localStorage.removeItem(AUTH_TOKEN_KEY);
  localStorage.removeItem(AUTH_USER_KEY);
};

const isAuthenticated = () => Boolean(getAuthToken() && getAuthUser());

const authHeaders = (): Record<string, string> => {
  const token = getAuthToken();
  return token ? { Authorization: `Bearer ${token}` } : {};
};

export {
  API_BASE_URL,
  API_BASE_URL2,
  API_CORE_BASE_URL,
  API_AI_BASE_URL,
  API_SYNC_BASE_URL,
  requireBrowserReachableUrl,
  resolveBrowserReachableUrl,
  DEFAULT_HEADERS,
  axios,
  getAuthToken,
  setAuthToken,
  getAuthUser,
  setAuthUser,
  clearAuthToken,
  clearAuth,
  isAuthenticated,
  authHeaders,
};
export type { AuthUser };
