# Canvas Object Storage Migration - 2026-05-26

## Scope

- Chose Railway Object Storage for canvas image assets.
- Added Spring Boot S3-compatible object storage integration.
- Added canvas asset upload/proxy APIs.
- Added `canvas_assets`, `canvas_elements`, and `canvas_viewports` schema.
- Added split canvas APIs for metadata, elements, and viewport data.
- Updated React canvas image upload to store asset URL/key metadata instead of new data URLs.
- Migrated existing canvas data URL images to Railway Object Storage.

## Deployment

- Railway bucket: `canvas-assets`
- Bucket region: `sin`
- Spring Railway service: `flownote`
- Vercel project alias: `https://flownote-react.vercel.app`

## Migration Result

- Existing migrated images: 10
- Documents scanned: 4
- Railway bucket object count after migration: 10
- DB documents still containing `data:image`: 0
- `canvas_assets` rows: 10

## Verification

- `flownote-server`: `./gradlew --project-cache-dir /tmp/flownote-server-gradle-cache -PbuildDir=/tmp/flownote-server-build test` passed.
- `flownote`: `yarn build` passed.
- Railway Spring health: `https://flownote-production.up.railway.app/actuator/health` returned `UP`.
- Vercel `/canvas`: `https://flownote-react.vercel.app/canvas` returned HTTP 200.
- Sample migrated asset URL returned HTTP 200 with image content type and 30-day cache header.

## Notes

- WebSocket was not introduced in this pass because the main traffic driver was image payload size in JSON. Object storage plus element-level APIs removes the high-impact payload first.
- Existing `/api/canvas/load` and `/api/canvas/save` remain for backward compatibility, but the React canvas now uses `/api/canvas/metadata`, `/api/canvas/elements`, and `/api/canvas/elements/save`.

## 2026-05-27 Duplicate Payload Cleanup

- Confirmed `canvas_documents` and `canvas_elements` had 18,349 duplicated canvas elements by matching `canvas_id`, `user_id`, `type`, and element id.
- Made `canvas_elements` the canonical payload source.
- Changed Spring save/load behavior so `canvas_documents.lines`, `canvas_documents.images`, and `canvas_documents.text_boxes` stay empty while `/load` is composed from `canvas_elements`.
- Added Flyway migration `V13__clear_canvas_document_payload_duplicates.sql`.
- Production verification after migration:
  - `document_json_elements`: 0
  - `canvas_element_rows`: 18,349
  - `same_id_in_both`: 0
  - `only_in_canvas_elements`: 18,349
  - `canvas_documents` total size after cleanup: 2,203,648 bytes
