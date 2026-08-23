# Railway Backend Deploy - 2026-05-23

## Scope

- Target project: Railway `flownote`
- App service: `flownote` Spring Boot backend
- Database service: Railway managed `Postgres`

## Actions

- Verified Railway CLI authentication and project context.
- Confirmed existing Railway `Postgres` service was present.
- Migrated local Docker Postgres data to Railway Postgres using a custom `pg_dump` backup and `pg_restore --no-owner --no-privileges`.
- Wired Spring datasource variables on the Railway app service using Railway service variable references.
- Set `FLOWNOTE_UPLOAD_DIR=/tmp/uploads` for the Railway app container.
- Moved the app replica to `asia-southeast1-eqsg3a` because US free-tier deploys were blocked during peak hours.
- Deployed `flownote-server` with Railway Dockerfile build.

## Verification

- Local source DB public table count: 16
- Railway DB public table count after restore: 16
- Spring test verification passed from a clean `/tmp` copy because the repository `flownote-server/.gradle` and `build` directories are root-owned.
- Docker image build for `flownote-server` passed.
- Railway deployment status: `SUCCESS`
- Public health endpoint: `https://flownote-production.up.railway.app/actuator/health` returned HTTP 200 with `{"status":"UP"}`.

## Notes

- Initial Railway deploy attempts to `us-west2` and `us-east4-eqdc4a` were blocked by Railway free-tier peak-hour limits.
- Railway logs show Flyway warning that PostgreSQL 18.4 is newer than the Flyway version's latest tested PostgreSQL version, but migrations validated successfully and schema version 11 was current.
- A temporary dump file was created under `/tmp` and was not added to the repository.
