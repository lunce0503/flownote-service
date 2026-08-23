# Canvas Pinch Zoom Anchor

- Date: 2026-05-19
- Area: `flownote/src/widgets/CanvasWidget/InfiniteCanvas/ui/Canvus.tsx`

## Symptom

On touch devices, two-finger zoom changed the canvas scale but did not keep the content under the inner point between the two fingers. The viewport drifted because zoom was effectively applied around the canvas origin and only the center movement delta was added to the offset.

## Cause

The pinch gesture stored browser client coordinates and updated `scale` separately from `offset`. The offset update only handled panning between the previous and current touch center, so the zoom anchor was not preserved.

## Fix

Pointer positions are now converted into canvas viewport coordinates. During pinch zoom, the offset is recalculated so the canvas point under the previous two-finger center remains under the new two-finger center after scaling. This makes pinch zoom expand and shrink around the inner point between the fingers.
