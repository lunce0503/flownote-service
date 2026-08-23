# Cloud Deploy And Docs Update - 2026-05-28

## Scope

- Added Vercel/Railway deployment steps to `docs/RELIABILITY.md`, `docs/HARNESS.md`, `docs/FRONTEND.md`, and `docs/QUALITY_SCORE.md`.
- Deployed the Vite React app to Vercel production.
- Deployed the Spring backend service to Railway.

## Validation

- `flownote`: `yarn build`
  - Result: success.
  - Note: existing large chunk warning remains.
- Root: `docker compose up -d --build`
  - Result: success. All services started.

## Deployment

- Vercel `flownote-react`
  - Deployment: `dpl_E8GYLnW7N4Vk7ffBMtCJh555Rqv8`
  - Production URL: `https://flownote-react-jjnedew62-flownote-service.vercel.app`
  - Alias: `https://flownote-react.vercel.app`
  - URL check: returned HTML successfully.
- Railway `flownote-main`
  - Deployment: `4994e286-3876-43b7-b652-ed2d5ea2c763`
  - Status: `SUCCESS`
  - Health: `https://flownote-production.up.railway.app/actuator/health` returned `{"status":"UP"}`.
