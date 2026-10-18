# Railway mobile production deployment stopped

- Date: 2026-09-15 11:51 UTC.
- Scope: project `flownote`, environment `production`, service `flownote-mobile-production` (static mobile web) only.
- Reason: user requested shutdown following Expo Go production and AI production shutdowns to reduce compute usage.
- Command: `railway down --service 89cea265-b497-48f1-9824-857a6d21df90 --environment ae55fc37-9251-48d1-bdbe-87a2ea3462fa --project 07ae56ef-08be-432d-948b-8f3b6ecb6cd5 --yes`.
- Deployment `dab842c5-9943-47ae-9188-39173e57a9d2` is `REMOVED`; production mobile service has no active deployments. The service and environment were not deleted.
- Read-only checks: production mobile `/health` returned 404; staging mobile `/health`, production Vercel web `/`, and production API gateway `/` returned 200.
- Impact: the production mobile web URL used by Safari/PWA is unavailable. Staging mobile remains available. Production Expo Go and AI were stopped in separate user requests; see `2026-09-15-0941-expo-go-production-down.md` and `2026-09-15-1009-flownote-ai-production-down.md`.
- Cost: this service's production compute stops accumulating after shutdown; historical charges are not removed. Staging mobile is still billed while running.
- To restore: use the staging-first cloud mobile release workflow (`node scripts/deploy-cloud.mjs release mobile`) and verify the production mobile `/health` endpoint and app separately. Do not treat a removed deployment as a running instance.
- No source code was modified. Only this operations report was added; Docker build and cloud deployment are unnecessary for a report-only change.
