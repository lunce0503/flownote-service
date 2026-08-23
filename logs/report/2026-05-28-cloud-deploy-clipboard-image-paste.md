# Cloud Deploy Clipboard Image Paste - 2026-05-28

## Scope

- Deployed canvas clipboard image paste support to cloud.

## Validation

- `flownote`: `yarn build`
  - Result: success.
  - Note: existing large chunk warning remains.

## Deployment

- Vercel `flownote-react`
  - Deployment: `dpl_7XpusfAZwsSHhZ5BbRzkcJQwm1dw`
  - Production URL: `https://flownote-react-o09qsm889-flownote-service.vercel.app`
  - Alias: `https://flownote-react.vercel.app`
  - URL check: returned HTML successfully.
- Railway `flownote-main`
  - Deployment: `95d2770d-dacd-4b3a-81bc-42ff6b4b1eb0`
  - Status: `SUCCESS`
  - Health: `https://flownote-production.up.railway.app/actuator/health` returned `{"status":"UP"}`.
