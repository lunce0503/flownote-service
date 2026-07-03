import { optionsResponse } from '../../../lib/cors';
import { proxyCoreApi } from '../../../lib/core-api';

const GET = async (request: Request) => proxyCoreApi(request, '/api/canvas/load', { method: 'GET' });

const OPTIONS = async () => optionsResponse();

export { GET, OPTIONS };
