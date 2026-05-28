import { NextResponse } from 'next/server';
import { corsHeadersFor, optionsResponse } from '../../../lib/cors';
import { publishSyncEvent, type SyncPayload } from '../../../lib/sync-events';

const POST = async (request: Request) => {
  const body = await request.json().catch(() => ({}));
  const token = typeof body.token === 'string' ? body.token : '';
  const resource = typeof body.resource === 'string' ? body.resource : 'all';
  const action = typeof body.action === 'string' ? body.action : 'changed';
  const corsHeaders = corsHeadersFor(request);

  if (!token) {
    return NextResponse.json({ message: 'Missing token' }, { status: 401, headers: corsHeaders });
  }

  publishSyncEvent({
    token,
    resource,
    action,
    at: new Date().toISOString(),
  } as SyncPayload);

  return NextResponse.json({ ok: true }, { headers: corsHeaders });
};

const OPTIONS = async (request: Request) => optionsResponse(request);

export { POST, OPTIONS };
