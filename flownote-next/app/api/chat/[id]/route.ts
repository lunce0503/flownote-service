import { optionsResponse } from '../../../lib/cors';
import { proxyCoreApi } from '../../../lib/core-api';

const DELETE = async (
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) => {
  const { id } = await params;
  return proxyCoreApi(request, `/api/chat/${id}`, { method: 'DELETE' });
};

const OPTIONS = async () => optionsResponse();

export { DELETE, OPTIONS };
