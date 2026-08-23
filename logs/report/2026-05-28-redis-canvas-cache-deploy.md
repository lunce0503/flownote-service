# Redis Canvas Cache Deploy - 2026-05-28

## Scope

- Added Redis read-through cache for the largest line/image canvas owned by `lunce`.
- Configured local Docker Redis and Railway Redis environment variables for `flownote-main`.
- Deployed Spring backend to Railway and Vite frontend to Vercel production.

## Validation

- `flownote-server`: `GRADLE_USER_HOME=/tmp/flownote-gradle ./gradlew test --no-daemon --project-cache-dir /tmp/flownote-server-gradle-cache -Dorg.gradle.project.buildDir=/tmp/flownote-server-build`
  - Result: success.
  - Note: project-local `.gradle/` and `build/` are root-owned, so validation used `/tmp` cache/build directories.
- `flownote`: `yarn build`
  - Result: success with existing large chunk warning.
- Root: `docker compose up -d --build`
  - Result: success. All services started, including `flownote-redis` and `flownote-spring`.

## Deployment

- Railway `flownote-main`
  - Deployment: `5ed07878-d25a-4071-a9a6-983a355f4691`
  - Status: `SUCCESS`
  - Health: `https://flownote-production.up.railway.app/actuator/health` returned `{"status":"UP"}`.
- Vercel `flownote-react`
  - Deployment: `dpl_9A6KdQW4LCfKxuS5aCbeyUQYpR4Y`
  - Production alias: `https://flownote-react.vercel.app`
