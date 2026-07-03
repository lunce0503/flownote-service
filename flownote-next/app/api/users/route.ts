import { NextResponse } from 'next/server';
import { corsHeaders, optionsResponse } from '../../lib/cors';
import { proxyCoreApi } from '../../lib/core-api';

const POST = async (request: Request) => {
  const body = await request.json().catch(() => ({}));
  return proxyCoreApi(request, '/api/users', { method: 'POST', body });
};

const GET = async () => {
  return NextResponse.json({ error: '사용자 목록 조회는 허용되지 않습니다.' }, { status: 403, headers: corsHeaders });
};

const OPTIONS = async () => optionsResponse();

export { POST, GET, OPTIONS };
