# Flownote FSD Audit

## Scope

- Target: `flownote/src/app`, `flownote/src/pages`, `flownote/src/widgets`, `flownote/src/features`, `flownote/src/shared`
- Date: 2026-05-22

## Evaluation Criteria

- `app`: application bootstrap and route wiring only. It should not own reusable business logic.
- `pages`: page composition only. It may assemble widgets/features but should not contain reusable domain logic.
- `widgets`: page-level UI blocks. It may orchestrate feature/entity APIs, but reusable state, storage, geometry, and interaction logic should move downward.
- `features`: reusable user interactions and feature state. Canvas gesture, geometry, viewport persistence, and canvas constants belong here when used by widgets.
- `shared`: domain-free utilities, UI primitives, API clients, assets, and auth infrastructure. Canvas-specific types or helpers should not live here.
- Empty files are allowed only when they are intentional public API placeholders; otherwise remove them.
- A function should move out of a component when it is pure, reusable, independently testable, or not directly tied to rendering JSX.

## Findings And Changes

- Removed empty `flownote/src/app/routers/magic/magic.css` and its import from `magic.tsx`.
- Removed unused empty `flownote/src/shared/types/index.ts`.
- Moved canvas constants from `CanvasWidget` to `features/canvas/model/canvasConstants.ts`.
- Moved per-canvas viewport localStorage logic to `features/canvas/model/canvasViewportStorage.ts`.
- Moved per-canvas viewport synchronization effects to `features/canvas/model/useStoredCanvasViewport.ts`.
- Moved lasso geometry and element status helpers to `features/canvas/model/canvasGeometry.ts`.
- Moved canvas library grouping/title helpers to `features/canvas/model/canvasLibraryModel.ts`.
- Moved lasso selection creation, counting, and bounds calculation to `features/canvas/model/canvasSelectionModel.ts`.
- Moved canvas interactive-target DOM helper to `features/canvas/model/canvasDom.ts`.
- Added reusable boolean localStorage state helper at `shared/lib/useLocalStorageBoolean.ts`.
- Added reusable string Set localStorage state helper at `shared/lib/useLocalStorageStringSet.ts`.
- Reused shared localStorage helpers for canvas toolbar settings, note drawing pencil mode, canvas folder collapse state, and blog folder collapse state.
- Increased canvas toolbar mobile touch targets to 48px and made crowded toolbar rows horizontally scrollable to avoid compressed or overlapping buttons.
- Moved blog note preview, blank note creation, note-folder mapping, unfiled note filtering, and folder grouping to `features/blog/model/blogListModel.ts`.
- Moved schedule day options, draft conversion, duration formatting, validation, sorting, day totals, and routine chart calculation to `features/schedule/model/scheduleModel.ts`.

## Current Verification Evidence

- No empty files remain under `flownote/src/app`, `flownote/src/pages`, `flownote/src/shared`, `flownote/src/widgets`, or `flownote/src/features`.
- No upward imports were found from `shared` to higher layers, from `entities` to higher layers, from `features` to `widgets/pages/app`, or from `widgets` to `pages/app`.
- `flownote` production build passes with `yarn build`.

## Remaining Risks

- `CanvasWidget/InfiniteCanvas/ui/Canvus.tsx` is still large and should be split further into canvas library panel, text editing overlay, pointer gesture handling, and canvas viewport composition.
- Several widgets remain large enough to deserve later FSD extraction: stock dashboard, blog list, daily schedule panel, social chat.
