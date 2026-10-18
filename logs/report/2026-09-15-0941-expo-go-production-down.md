# Expo Go production deployment stopped

- Date: 2026-09-15 09:41 UTC
- Scope: Railway project `flownote`, `production` environment, `flownote-expo-go` service only.
- Reason: user requested shutdown after the service contributed $4.82 to the current billing period's memory-heavy usage.
- Command: `railway down --service ce14582c-b711-4a7f-accb-7f48bf8e5cb1 --environment ae55fc37-9251-48d1-bdbe-87a2ea3462fa --project 07ae56ef-08be-432d-948b-8f3b6ecb6cd5 --yes`.
- Deployment `34acd3c3-a7f8-4ba5-a93e-18ecb7bf691c` is `REMOVED`; production Expo Go has no active deployment. Its public manifest URL returns HTTP 404.
- Staging Expo Go, production mobile web (`/health`), and production API (`/`) each return HTTP 200. No service or environment was deleted.
- Impact: Expo Go cannot open or refresh the production project while the deployment is stopped. Existing app data and the API are unaffected; cost reduction starts after compute stops, not retroactively.
- To restore: deploy the Expo Go service through the normal staging-first cloud release workflow (`node scripts/deploy-cloud.mjs release expo`) after validating staging. Do not use `railway redeploy` on a removed deployment without checking its behavior.
- Validation: Railway deployment list, active deployments, and read-only HTTPS checks. No source change, Docker build, or release was required for this operational stop.
