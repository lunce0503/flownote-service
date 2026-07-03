import { optionsResponse } from '../../../lib/cors';
import { proxyCoreApi } from '../../../lib/core-api';

const GET = async (
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) => {
  const { id } = await params;
  return proxyCoreApi(request, `/api/social/${id}`, { method: 'GET' });
};

const POST = async (
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) => {
  const { id } = await params;
  const body = await request.json().catch(() => ({}));
  return proxyCoreApi(request, `/api/social/${id}`, { method: 'POST', body });
};

const OPTIONS = async () => optionsResponse();

export { GET, POST, OPTIONS };
