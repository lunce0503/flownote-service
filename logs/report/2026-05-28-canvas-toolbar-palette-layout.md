# Canvas Toolbar Palette Layout - 2026-05-28

## Scope

- Changed the canvas pen color palette to fixed-width color cells.
- Added a white dot indicator on the selected pen color.
- Moved image insert from the file/settings group into the tool group.
- Kept the right-side group to save, load, and settings buttons.
- Removed the grid management button from the tool group.

## Validation

- `flownote`: `yarn build`
  - Result: success.
  - Note: existing large chunk warning remains.
- Root: `docker compose up -d --build`
  - Result: success. All services started.
