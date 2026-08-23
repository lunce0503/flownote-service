# Canvas Clipboard Image Paste - 2026-05-28

## Scope

- Added canvas image paste support for clipboard image files, including Windows `Win+Shift+S` screenshots.
- Reused the existing canvas asset upload and image placement path so pasted screenshots are saved like file-uploaded images.
- Kept normal text paste behavior for inputs, textareas, selects, and contenteditable elements.

## Validation

- `flownote`: `yarn build`
  - Result: success.
  - Note: existing large chunk warning remains.
- Root: `docker compose up -d --build`
  - Result: success. All services started.
