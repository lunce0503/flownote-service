import { optionsResponse } from '../../../lib/cors';
import { proxyCoreApi } from '../../../lib/core-api';

const POST = async (request: Request) => {
  const body = await request.json().catch(() => ({}));
  return proxyCoreApi(request, '/api/canvas/save', { method: 'POST', body });
};

const OPTIONS = async () => optionsResponse();

export { POST, OPTIONS };
