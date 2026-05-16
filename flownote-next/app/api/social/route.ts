import { optionsResponse } from '../../lib/cors';
import { proxyCoreApi } from '../../lib/core-api';

const GET = async (request: Request) => proxyCoreApi(request, '/api/social', { method: 'GET' });

const POST = async (request: Request) => {
  const body = await request.json().catch(() => ({}));
  return proxyCoreApi(request, '/api/social', { method: 'POST', body });
};

const OPTIONS = async () => optionsResponse();

export { GET, POST, OPTIONS };
