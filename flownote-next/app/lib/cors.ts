import { NextResponse } from 'next/server';

const allowedOrigin = process.env.WEB_ORIGIN || process.env.NEXT_PUBLIC_WEB_ORIGIN || 'http://localhost:5173';

const corsHeaders = {
  'Access-Control-Allow-Origin': allowedOrigin,
  'Access-Control-Allow-Methods': 'GET, POST, PATCH, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  Vary: 'Origin',
};

const optionsResponse = () =>
  new NextResponse(null, {
    status: 200,
    headers: corsHeaders,
  });

export { corsHeaders, optionsResponse };
