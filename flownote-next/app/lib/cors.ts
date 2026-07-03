import { NextResponse } from 'next/server';

const configuredOrigins = [
  process.env.WEB_ORIGIN,
  process.env.NEXT_PUBLIC_WEB_ORIGIN,
  process.env.CORS_ORIGINS,
]
  .flatMap((value) => (value ?? '').split(','))
  .map((value) => value.trim())
  .filter(Boolean);

const defaultOrigins = ['http://localhost:5173', 'http://localhost:3000', 'https://flownote-react.vercel.app'];

const allowedOrigins = Array.from(new Set([...configuredOrigins, ...defaultOrigins]));

const allowedOriginFor = (request?: Request) => {
  const requestOrigin = request?.headers.get('origin') ?? '';
  if (requestOrigin && allowedOrigins.includes(requestOrigin)) {
    return requestOrigin;
  }
  return configuredOrigins[0] || defaultOrigins[0];
};

const corsHeadersFor = (request?: Request) => ({
  'Access-Control-Allow-Origin': allowedOriginFor(request),
  'Access-Control-Allow-Methods': 'GET, POST, PATCH, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  Vary: 'Origin',
});

const corsHeaders = corsHeadersFor();

const optionsResponse = (request?: Request) =>
  new NextResponse(null, {
    status: 200,
    headers: corsHeadersFor(request),
  });

export { corsHeaders, corsHeadersFor, optionsResponse };
