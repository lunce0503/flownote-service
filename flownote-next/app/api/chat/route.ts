import { optionsResponse } from '../../lib/cors';
import { proxyCoreApi } from '../../lib/core-api';

const GET = async (request: Request) => proxyCoreApi(request, '/api/chat', { method: 'GET' });

const POST = async (request: Request) => {
  const body = await request.json().catch(() => ({}));
  return proxyCoreApi(request, '/api/chat', { method: 'POST', body });
};

const DELETE = async (request: Request) => proxyCoreApi(request, '/api/chat', { method: 'DELETE' });

const OPTIONS = async () => optionsResponse();

export { GET, POST, DELETE, OPTIONS };
