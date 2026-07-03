import { NextResponse } from 'next/server';
import { corsHeadersFor } from './cors';

const coreApiBaseUrl = () => {
  const url = process.env.CORE_API_URL || process.env.SPRING_API_URL || process.env.NEXT_PUBLIC_API_URL;
  if (!url) {
    throw new Error('CORE_API_URL or SPRING_API_URL is required.');
  }
  return url.replace(/\/$/, '');
};

const proxyCoreApi = async (
  request: Request,
  path: string,
  options: { method?: string; body?: unknown } = {}
) => {
  const method = options.method ?? request.method;
  const headers: HeadersInit = {
    Accept: 'application/json',
  };
  const authorization = request.headers.get('authorization');
  if (authorization) {
    headers.Authorization = authorization;
  }

  let body: BodyInit | undefined;
  if (options.body !== undefined) {
    headers['Content-Type'] = 'application/json';
    body = JSON.stringify(options.body);
  }

  const response = await fetch(`${coreApiBaseUrl()}${path}`, {
    method,
    headers,
    body,
    cache: 'no-store',
  });
  const text = await response.text();
  const data = text ? JSON.parse(text) : null;

  return NextResponse.json(data, {
    status: response.status,
    headers: corsHeadersFor(request),
  });
};

export { proxyCoreApi };
