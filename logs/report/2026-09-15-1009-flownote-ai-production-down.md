# Railway AI production deployment stopped

- Date: 2026-09-15 10:09 UTC.
- Scope: project `flownote`, environment `production`, service `flownote-ai` only. Staging remains deployed.
- Reason: user requested the stop after the AI service contributed $1.68 to current billing-period usage (staging and production combined).
- Command: `railway down --service e7bcf165-5016-4e4e-bdd3-b34ea9ffc0b6 --environment ae55fc37-9251-48d1-bdbe-87a2ea3462fa --project 07ae56ef-08be-432d-948b-8f3b6ecb6cd5 --yes`.
- Deployment `c509ad9c-f6f1-4607-871b-710dad17e1c7` is `REMOVED`, and the production service has no active deployments. The service and staging environment were not deleted.
- Verified: production gateway `/` returned 200; production `/api/capabilities` returned 502, while staging `/api/capabilities` returned 200.
- Impact: production `/api/aiclient`, `/api/agent-note`, `/api/market`, and `/api/capabilities` requests routed through the gateway cannot reach the AI upstream. Core, schedule, and canvas backends remain running. Expect AI-dependent UI requests to fail until restored.
- Cost: production compute usage stops accumulating; staging AI is still running, and previously accrued charges remain.
- Restore by validating staging and then following the cloud-only staging-first AI release workflow in `docs/DEPLOYMENT.md` and `scripts/deploy-cloud.mjs`. Check production AI routes after recovery.
- This operational stop did not change application source. No Docker build or cloud release was needed; the report-only change is not deployed.
