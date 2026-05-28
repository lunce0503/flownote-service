import { randomUUID } from 'crypto';
import { corsHeadersFor, optionsResponse } from '../../../lib/cors';
import { addSyncClient, removeSyncClient, writeEvent } from '../../../lib/sync-events';

const GET = async (request: Request) => {
  const { searchParams } = new URL(request.url);
  const token = searchParams.get('token') ?? '';

  if (!token) {
    return new Response('Missing token', { status: 401, headers: corsHeadersFor(request) });
  }

  const clientId = randomUUID();
  let keepAlive: ReturnType<typeof setInterval> | null = null;

  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      addSyncClient(token, clientId, controller);
      writeEvent(controller, 'connected', { at: new Date().toISOString() });
      keepAlive = setInterval(() => {
        try {
          writeEvent(controller, 'ping', { at: new Date().toISOString() });
        } catch {
          removeSyncClient(clientId);
          if (keepAlive) clearInterval(keepAlive);
        }
      }, 25000);
    },
    cancel() {
      removeSyncClient(clientId);
      if (keepAlive) clearInterval(keepAlive);
    },
  });

  return new Response(stream, {
    headers: {
      ...corsHeadersFor(request),
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    },
  });
};

const OPTIONS = async (request: Request) => optionsResponse(request);

export { GET, OPTIONS };
