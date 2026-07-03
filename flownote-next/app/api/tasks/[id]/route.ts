import { optionsResponse } from '../../../lib/cors';
import { proxyCoreApi } from '../../../lib/core-api';

const DELETE = async (
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) => {
  const { id } = await params;
  return proxyCoreApi(request, `/api/tasks/${id}`, { method: 'DELETE' });
};

const PATCH = async (
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) => {
  const { id } = await params;
  const body = await request.json().catch(() => ({}));
  return proxyCoreApi(request, `/api/tasks/${id}`, { method: 'PATCH', body });
};

const OPTIONS = async () => optionsResponse();

export { DELETE, PATCH, OPTIONS };
