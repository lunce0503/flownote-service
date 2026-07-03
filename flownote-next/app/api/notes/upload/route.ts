import { NextResponse } from 'next/server';
import { corsHeaders, optionsResponse } from '../../../lib/cors';

const coreApiBaseUrl = () => {
  const url = process.env.CORE_API_URL || process.env.SPRING_API_URL || process.env.NEXT_PUBLIC_API_URL;
  if (!url) {
    throw new Error('CORE_API_URL or SPRING_API_URL is required.');
  }
  return url.replace(/\/$/, '');
};

const POST = async (request: Request) => {
  const headers: HeadersInit = {};
  const authorization = request.headers.get('authorization');
  if (authorization) {
    headers.Authorization = authorization;
  }

  const response = await fetch(`${coreApiBaseUrl()}/api/notes/upload`, {
    method: 'POST',
    headers,
    body: await request.formData(),
    cache: 'no-store',
  });
  const text = await response.text();
  const data = text ? JSON.parse(text) : null;

  return NextResponse.json(data, {
    status: response.status,
    headers: corsHeaders,
  });
};

const OPTIONS = async () => optionsResponse();

export { POST, OPTIONS };
