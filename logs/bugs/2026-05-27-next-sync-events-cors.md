# Next Sync Events CORS Failure

## Symptom

`https://flownote-react.vercel.app` could not open:

`https://flownote-next.vercel.app/api/sync/events?token=...`

The browser blocked the request because the response did not include
`Access-Control-Allow-Origin`.

## Cause

`flownote-next/app/api/sync/events/route.ts` returned a raw SSE `Response`
without the shared CORS headers used by the other API routes.

## Fix

- Added request-aware CORS header selection in `flownote-next/app/lib/cors.ts`.
- Added `https://flownote-react.vercel.app` to the built-in allowed origins.
- Applied CORS headers to `/api/sync/events` success and error responses.
- Added `OPTIONS` support for `/api/sync/events`.
- Updated sync publish and core API proxy responses to echo the allowed request origin.

## Verification

- `yarn lint` passed in `flownote-next/`.
- `yarn build` passed in `flownote-next/`.
