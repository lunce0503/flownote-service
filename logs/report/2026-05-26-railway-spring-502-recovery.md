# Railway Spring 502 Recovery - 2026-05-26

## Symptom

- Railway HTTP logs showed `OPTIONS /api/users/login` returning HTTP 502.
- The edge response was `Application failed to respond`.
- Upstream errors were repeated `connection refused` entries for the Spring backend deployment instance.

## Cause

- The issue was not a frontend routing issue and not a CORS configuration issue.
- The Spring backend service was in a sleeping state and failed to wake cleanly.
- Recent runtime logs showed Spring reaching Tomcat and database initialization, but not consistently reaching the final started/healthy state after wake.
- The service was deployed in EU West, and a redeploy there was blocked by Railway free-tier peak-hour restrictions.

## Actions

- Verified FastAPI was healthy while Spring `/actuator/health` returned 502.
- Confirmed Spring and Postgres were configured with one replica each.
- Moved the Spring backend replica from EU West to US West, matching the existing Postgres region.
- Redeployed the Spring backend after the region move.

## Verification

- Spring deployment status: `SUCCESS`
- Spring region: `us-west2`
- Postgres region: `us-west2`
- Spring `/actuator/health` returned HTTP 200 with status `UP`.
- `OPTIONS /api/users/login` from `https://flownote-react.vercel.app` returned HTTP 200 with CORS headers.
- Test `POST /api/users/login` returned an application-level HTTP 400 response instead of a Railway 502.

## Notes

- Railway serverless/app sleep remains enabled by configuration. On the current plan, disabling it through CLI returned no applicable change.
- Upgrading to Hobby or configuring the service to stay awake from the dashboard should reduce or remove future cold-start 502 risk.
- Keeping Spring and Postgres in the same region reduces startup and database connection latency.
