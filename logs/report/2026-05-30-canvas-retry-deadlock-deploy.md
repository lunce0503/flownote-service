# Canvas retry and deadlock deployment

## Scope

- Investigated current Railway `flownote-main` logs for canvas save/load errors.
- Updated the React canvas persistence flow to avoid staying in a long retry state with stale saved payloads.
- Updated the Spring canvas save transaction to serialize overlapping saves for the same user and canvas.
- Deployed the frontend to Vercel and the Spring service to Railway.

## Railway finding

- Recent HTTP logs showed repeated `499` and `500` responses on:
  - `POST /api/canvas/elements/save`
  - `GET /api/canvas/elements`
  - `GET /api/canvas/metadata`
- Runtime logs showed PostgreSQL `deadlock detected` errors in `CanvasService.saveElements`.
- Runtime logs also showed Hikari pool exhaustion: all 10 connections active, no idle connections, and callers waiting.
- The current failure mode is concurrent canvas saves causing deadlocks and connection starvation, not primarily Railway Postgres sleep.

## Changes

- `flownote/src/features/canvas/model/usePersistence.tsx`
  - Adds a 12 second timeout to normal canvas save requests.
  - On stalled save/retry, replaces the queued retry payload with the newest in-memory canvas payload when newer edits exist.
  - Keeps the retry queue to one item per canvas, so old failed payloads do not accumulate.

- `flownote-server/src/main/java/com/flownote/canvas/CanvasService.java`
  - Adds a transaction-scoped PostgreSQL advisory lock keyed by `userId` and `canvasId`.
  - This serializes overlapping `saveElements` transactions for the same canvas while allowing unrelated canvases to save independently.

## Validation

- `cd flownote && yarn build` passed.
- `cd flownote-server && GRADLE_USER_HOME=/tmp/flownote-gradle-home ./gradlew -Dorg.gradle.project.buildDir=/tmp/flownote-server-build --project-cache-dir /tmp/flownote-gradle-project-cache test --no-daemon` passed.
- The normal `./gradlew test` path was blocked by root-owned generated directories under `flownote-server/build/`; the successful validation used temporary Gradle/build directories without changing those generated files.
- `docker compose up -d --build` passed.
- `docker compose ps` showed all local services running.

## Deployment

- Vercel production deployment:
  - Deployment ID: `dpl_FZs7qvZwUVifdYMw4KRthJ752wTz`
  - Production URL: `https://flownote-react.vercel.app`

- Railway `flownote-main` production deployment:
  - Deployment ID: `2eea47b6-ff3d-4f3d-b35a-e7bfd18772e6`
  - Status: `SUCCESS`
  - Health check: `https://flownote-production.up.railway.app/actuator/health` returned `{"status":"UP"}`
  - Immediate post-deploy HTTP log check for `>=400` over the last 5 minutes returned no entries.
