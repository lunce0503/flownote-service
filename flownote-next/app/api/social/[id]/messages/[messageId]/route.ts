import { optionsResponse } from '../../../../../lib/cors';
import { proxyCoreApi } from '../../../../../lib/core-api';

const DELETE = async (
  request: Request,
  { params }: { params: Promise<{ id: string; messageId: string }> }
) => {
  const { id, messageId } = await params;
  return proxyCoreApi(request, `/api/social/${id}/${messageId}`, { method: 'DELETE' });
};

const OPTIONS = async () => optionsResponse();

export { DELETE, OPTIONS };
