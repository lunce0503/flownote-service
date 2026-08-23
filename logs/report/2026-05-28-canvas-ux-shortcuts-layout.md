# Canvas UX Shortcuts And Layout - 2026-05-28

## Scope

- Added keyboard copy/paste for lasso-selected canvas elements.
- Removed toolbar buttons that had no action.
- Moved the canvas toolbar out of the canvas viewport so it does not overlap the canvas folder panel.
- Raised the Flownote header sidebar overlay above canvas controls.

## Validation

- `flownote`: `yarn build`
  - Result: success.
  - Note: existing large chunk warning remains.
- Root: `docker compose up -d --build`
  - Result: success. All services started.
