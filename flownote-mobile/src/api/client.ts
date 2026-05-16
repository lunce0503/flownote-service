import type { MobileConfig } from '../types/api';

const trimSlash = (value: string) => value.replace(/\/$/, '');

const defaultWasUrl = process.env.EXPO_PUBLIC_WAS_URL || 'http://localhost:8080';

const requestJson = async <T>(
  baseUrl: string,
  path: string,
  options: RequestInit = {},
): Promise<T> => {
  const response = await fetch(`${trimSlash(baseUrl)}${path}`, {
    ...options,
    headers: {
      Accept: 'application/json',
      ...(options.body ? { 'Content-Type': 'application/json' } : {}),
      ...(options.headers ?? {}),
    },
  });

  const text = await response.text();
  let data: unknown = null;

  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    throw new Error('서버 응답을 해석하지 못했습니다.');
  }

  if (!response.ok) {
    const message = getErrorMessage(data) || '요청을 처리하지 못했습니다.';
    throw new Error(message);
  }

  return data as T;
};

const getErrorMessage = (data: unknown) => {
  if (!data || typeof data !== 'object') return null;

  const record = data as Record<string, unknown>;
  if (typeof record.message === 'string') return record.message;
  if (typeof record.error === 'string') return record.error;

  return null;
};

export const loadMobileConfig = async (wasUrl = defaultWasUrl) => {
  return requestJson<MobileConfig>(wasUrl, '/api/mobile/config');
};
