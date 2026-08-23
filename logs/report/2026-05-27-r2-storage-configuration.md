# R2 Storage Configuration - 2026-05-27

## Railway Variables Checked

The Spring `flownote` Railway service has these storage variables configured:

- `FLOWNOTE_STORAGE_ENDPOINT`
- `FLOWNOTE_STORAGE_BUCKET`
- `FLOWNOTE_STORAGE_REGION`
- `FLOWNOTE_STORAGE_ACCESS_KEY_ID`
- `FLOWNOTE_STORAGE_SECRET_ACCESS_KEY`
- `FLOWNOTE_STORAGE_PUBLIC_BASE_URL`

`FLOWNOTE_STORAGE_ENDPOINT` points at an R2 S3 endpoint, `FLOWNOTE_STORAGE_REGION` is set, and
`FLOWNOTE_STORAGE_PUBLIC_BASE_URL` points at an HTTPS public R2/development or custom public URL.

## Expected R2 Values

```env
FLOWNOTE_STORAGE_ENDPOINT=https://<ACCOUNT_ID>.r2.cloudflarestorage.com
FLOWNOTE_STORAGE_BUCKET=<R2_BUCKET_NAME>
FLOWNOTE_STORAGE_REGION=auto
FLOWNOTE_STORAGE_ACCESS_KEY_ID=<R2_ACCESS_KEY_ID>
FLOWNOTE_STORAGE_SECRET_ACCESS_KEY=<R2_SECRET_ACCESS_KEY>
FLOWNOTE_STORAGE_PUBLIC_BASE_URL=https://<R2_PUBLIC_DOMAIN_OR_CDN_DOMAIN>
```

## Runtime Behavior

- Spring uploads canvas image objects through the S3-compatible R2 endpoint.
- `objectKey` is stored in Postgres.
- When `FLOWNOTE_STORAGE_PUBLIC_BASE_URL` is set, upload responses return the direct R2/CDN URL.
- When `FLOWNOTE_STORAGE_PUBLIC_BASE_URL` is empty, upload responses return the Spring proxy URL:
  `/api/canvas/assets/{assetId}`.

## Cost-Oriented Target Structure

```text
Browser -> R2/CDN: image/object downloads
Browser -> Railway Spring: auth, metadata, object key registration
Railway Spring -> R2: uploads and fallback asset reads
Postgres: metadata, ownership, revisions, indexes
```

This avoids serving large asset bytes through the Railway Spring service for normal reads.

## Payload Architecture Progress

- Added schema migration `V14__r2_payload_locations.sql`.
- Added R2 location columns for `canvas_elements`.
- Added R2 content location columns for `notes`.
- Updated Spring code so new canvas element payloads can be written as JSON objects under:
  - `canvas-elements/{canvasId}/{type}/{elementId}.json`
- Updated Spring code so new note content can be written as JSON objects under:
  - `note-content/{userId}/{noteId}.json`
- Added migration script:
  - `scripts/migrate_payloads_to_r2.py`
  - Supports `--limit`, `--dry-run`, and an R2 read/write smoke test before committing writes.
- Updated existing image asset migration script:
  - `scripts/migrate_canvas_assets_between_s3.py`
  - Supports `--limit`, `--dry-run`, and a destination R2 read/write smoke test before copying objects.
- Added read-only migration verification script:
  - `scripts/verify_r2_payload_migration.py`
- Verified local Spring server tests pass:
  - `./gradlew --project-cache-dir /tmp/flownote-server-gradle-cache -PbuildDir=/tmp/flownote-server-build test`
- Verified migration scripts compile:
  - `python3 -m py_compile scripts/check_r2_storage.py scripts/migrate_payloads_to_r2.py scripts/migrate_canvas_assets_between_s3.py scripts/verify_r2_payload_migration.py`
- Added reusable R2 smoke test:
  - `scripts/check_r2_storage.py`
- Added optional Spring startup validation:
  - `FLOWNOTE_STORAGE_VALIDATE_ON_STARTUP=true`
  - When enabled, Spring performs one R2 `PutObject`/`GetObject`/`DeleteObject` check during startup.
- Added R2 object lifecycle cleanup in Spring:
  - Deleted canvas element JSON objects are removed from R2 when elements are removed or a canvas document is deleted.
  - Deleted note content JSON objects are removed from R2 when a note is deleted.
  - R2 deletions are scheduled after DB commit to avoid deleting an object while its DB reference is rolled back.
- Added message payload storage in R2:
  - New chat messages are stored under `chat-messages/{userId}/{messageId}.txt`.
  - New social room messages are stored under `social-messages/{roomId}/{userId}/{messageId}.txt`.
  - Postgres keeps message object key, byte size, and public URL columns.
  - Existing message migration and verification scripts now include chat/social messages.
- Added schema locations and verification gates for remaining structured payloads:
  - task memo, task links, task time logs
  - daily schedule memo

## Production Rollout Result

R2 S3 API authentication is fixed and the smoke test passes:

```text
R2 read/write check passed
```

Spring service `flownote` was deployed to Railway production with R2 payload code. Runtime health is
healthy and Flyway applied the storage migrations:

- `V14__r2_payload_locations.sql`
- `V15__r2_message_locations.sql`
- `V16__r2_structured_payload_locations.sql`

Existing Railway bucket image objects were copied to R2:

- canvas image elements processed: 11
- copied objects: 11
- updated image payload URLs: 11

Existing Postgres payloads were migrated to R2 and verified:

- canvas elements: 18,109 / 18,109 have `object_key`
- notes: 31 / 31 have `content_object_key`
- chat messages: 7 / 7 have `message_object_key`
- social messages: 5 / 5 have `message_object_key`
- task memo/link/time-log pending counts: 0
- schedule memo pending count: 0
- large DB payload checks: 0 remaining for canvas, notes, messages, tasks, and schedule memos
- canvas assets missing object keys: 0

The migration scripts now avoid passing database passwords in process arguments and use `PGPASSWORD`
for `psql`.
