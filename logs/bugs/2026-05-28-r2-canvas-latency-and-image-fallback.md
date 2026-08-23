# R2 Canvas Latency And Image Fallback

## Symptom

Canvas loading was slow after moving element payloads to R2. Some canvas images also failed to load
from the public R2 URL.

## Evidence

- Railway logs showed canvas save failures around `CanvasService.saveElements`, with PostgreSQL I/O
  errors during the old full-canvas merge/save path.
- The largest production canvas has 9,609 elements.
- The old element load path could read thousands of individual R2 JSON objects for a single canvas.
- A sampled R2 public image URL returned `404 Not Found`, while the same image object existed through
  authenticated S3 API access.

## Fix

- Added `V17__canvas_element_snapshots.sql`.
- Added per-canvas R2 element snapshots under `canvas-snapshots/{canvasId}/elements.json`.
- Changed canvas element loading to prefer one snapshot R2 read instead of one R2 read per element.
- Changed `/api/canvas/elements/save` to apply only added/modified/deleted deltas instead of loading
  and rewriting the full canvas.
- Enabled Spring response compression for large JSON responses.
- Added `scripts/warm_canvas_element_snapshots.py` and warmed existing production canvases.
- Added frontend image fallback: if the R2 public image URL fails, retry
  `/api/canvas/assets/{assetId}`.

## Production Verification

- Spring Railway deployment is healthy.
- Existing production snapshots:
  - documents with elements: 11
  - snapshots missing: 0
  - snapshots present: 11
  - largest snapshot: 11,177,759 bytes
- Largest canvas `/api/canvas/elements` measurement:
  - identity transfer: 11,177,767 bytes, about 3.06 seconds
  - gzip transfer: 2,606,794 bytes, about 1.99 seconds
- Spring asset proxy returned `200`, `image/png`, CORS header for `https://flownote-react.vercel.app`,
  and the expected image byte count.
- `flownote-react` was deployed to Vercel production with the image fallback.
