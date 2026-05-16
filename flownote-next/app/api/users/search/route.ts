import { optionsResponse } from '../../../lib/cors';
import { proxyCoreApi } from '../../../lib/core-api';

const GET = async (request: Request) => {
  const url = new URL(request.url);
  const query = url.searchParams.get('q') ?? '';
  return proxyCoreApi(request, `/api/users/search?q=${encodeURIComponent(query)}`, { method: 'GET' });
};

const OPTIONS = async () => optionsResponse();

export { GET, OPTIONS };
