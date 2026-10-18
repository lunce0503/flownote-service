# Canvas minimum zoom 10% cloud release

- Date: 2026-09-15 12:28 UTC.
- Interpretation: after discussing lower minimum zoom, the user's "10x view" request means 10% scale (ten times the 100% viewport's world width). The maximum remains 500%.
- Canvas scale limits are shared across wheel zoom, touch pinch, and stored-viewport restore. Canvas code map documents the range; cloud zoom E2E covers the floor and restored zoom.
- Web-only release smoke checks the web assets and core API without requiring the production mobile and Expo Go services, which the user stopped separately, to be online.
- Checks: `node --check scripts/deploy-cloud.mjs`, `yarn lint`, `yarn build`, `yarn e2e --list`, and `git diff --check` passed.
- Cloud staging E2E: 8/8 passed, including 10% wheel floor and reloaded viewport; no local application server or production data was used.
- Staging web: deployment `dpl_ESeZJrVfaSWKJgNSnMBu8PzWETt5`, READY, `https://flownote-react-staging-f9r7h2xor-flownote-service.vercel.app`.
- Production web: deployment `dpl_BTU7NgzepgCzvi6dD2JLsA1dddy6`, READY, `https://flownote-react-gzl0qaade-flownote-service.vercel.app`.
- Both deploy receipts have source fingerprint `26667ff7dfa3`. Production and staging web aliases and production API returned HTTP 200.
- Production mobile and Expo Go aliases still return 404 as expected from the previous user-requested shutdowns. No Railway service was deployed or restarted for this web-only change.
- Existing unrelated worktree changes were not reverted or included in a commit. The frontend release uploads the current source tree, so coordinate subsequent commits separately.
