# Blog Note Save Queue Deployment - 2026-06-14

## Scope

- Serialized BlockNote autosaves through a latest-wins queue.
- Added note revision and client identifiers to prevent stale writes and sync echoes.
- Added server-side optimistic revision checks and revision-specific object keys.
- Updated Next sync events, FastAPI MCP note writes, and mobile note writes for the revision contract.

## Validation

- `flownote-server`: `./gradlew test` passed.
- `flownote`: `yarn build` passed.
- `flownote-next`: `yarn build` and `npx eslint app` passed.
- `flownote-mobile`: `npx tsc --noEmit` passed.
- `flownote-API`: `uv run python -m unittest discover -s tests -v` passed (9 tests).
- Repository: `git diff --check` passed.
- Docker: `docker compose up -d --build` passed; all services are running.
- Local health: Spring actuator `UP`; React and Next returned HTTP 200.

## Production Deployments

- Vercel `flownote-react`: `dpl_CV2m6o6P7tCzN1ycy2UD6HXeB9w5` (`READY`)
  - https://flownote-react.vercel.app
- Vercel `flownote-next`: `dpl_5J8996hUH6P1aRVFMrbTeKEzUP67` (`READY`)
  - https://flownote-next.vercel.app
- Railway `flownote-main`: `b577db8a-01fa-4cb3-abca-dfebf240bf27` (`SUCCESS`)
  - https://flownote-production.up.railway.app
- Railway `flownote-api`: `d4f32670-ef2d-45e9-8e73-26435223fba1` (`SUCCESS`)
  - https://flownote-api-production.up.railway.app

Production health checks returned HTTP 200, Spring actuator reported `UP`, and Flyway migrated the production schema from version 19 to version 20.

## Notes

- Full `yarn lint` in `flownote-next` still scans pre-existing `.vercel/output` generated files; source-only `npx eslint app` passed.
- Vite reports an existing large chunk warning.
- Flyway reports that PostgreSQL 18.4 is newer than its tested support range (up to PostgreSQL 16); migration V20 still completed successfully.
