# Vercel and Railway Deploy - 2026-05-26

## Scope

- Vercel frontend app: `flownote` Vite React
- Vercel frontend app: `flownote-next` Next.js
- Railway backend service: `flownote` Spring Boot
- Railway backend service: `flownote-api` FastAPI
- Railway database service: `Postgres`

## Public Endpoints

- React frontend: `https://flownote-react.vercel.app`
- Next frontend/API: `https://flownote-next.vercel.app`
- Spring backend: `https://flownote-production.up.railway.app`
- FastAPI backend: `https://flownote-api-production.up.railway.app`

## Environment Wiring

- Vercel `flownote` production variables point browser API calls to the Railway Spring and FastAPI services, and sync calls to the Vercel Next app.
- Vercel `flownote-next` production variables point server/API calls to the Railway Spring service and set the React app as `WEB_ORIGIN`.
- Railway `flownote` uses Railway Postgres service references for `SPRING_DATASOURCE_URL`, `SPRING_DATASOURCE_USERNAME`, and `SPRING_DATASOURCE_PASSWORD`.
- Railway `flownote-api` uses `CORE_API_BASE_URL` to call the Spring backend over the Railway private domain.
- Railway CORS origins are restricted to the deployed Vercel aliases.

Secret values are intentionally omitted from this report.

## Actions

- Created the Railway `flownote-api` service.
- Configured production environment variables on Railway and Vercel.
- Generated a public Railway domain for the FastAPI service.
- Deployed `flownote-server` to Railway.
- Deployed `flownote-API` to Railway.
- Redeployed `flownote-next` to Vercel production after environment variable updates.
- Redeployed `flownote` to Vercel production after environment variable updates.

## Verification

- React frontend returned HTTP 200 from `https://flownote-react.vercel.app`.
- Next frontend returned HTTP 200 from `https://flownote-next.vercel.app`.
- Spring health endpoint returned HTTP 200 with status `UP`.
- FastAPI root endpoint returned HTTP 200.
- Next `/api/tasks` returned the expected unauthenticated HTTP 401 response and included the React Vercel origin in CORS headers.
- The React production bundle includes the expected Railway and Next production URLs.
- Vercel production deployments are in `Ready` state for both frontends.
- Railway latest deployments are in `SUCCESS` state for both backend services.

## Notes

- Railway free-tier deploys were blocked in the original target region during peak hours, so the backend app services were moved to `eu-west`.
- Railway sleep remains enabled for app services, so the first request after inactivity can cold start.
- The Railway Postgres service remains in its existing region; this may add latency compared with co-locating all Railway services in one region.
- Vercel builds completed with non-blocking dependency warnings.
