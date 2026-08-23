# BlockNote Korean IME cursor jump

## Symptom

- While editing Korean text in the middle of a BlockNote document, subsequent input could continue at the bottom of the note.
- The issue was most visible after Korean IME composition completed during body editing.

## Cause

- The body editor shared the same `compositionend` handler as the title input.
- Body IME completion triggered title saving and an immediate note flush, which published note sync events during active editing.
- The current editor view subscribed to those note sync events and called `editor.replaceBlocks(...)`, replacing the document and allowing BlockNote selection to move away from the user's active cursor.

## Fix

- Split title and body IME completion handlers so body editing only queues a body save.
- Memoize the BlockNote schema so editor configuration stays stable across React renders.
- Skip `replaceBlocks(...)` for sync payloads whose block content matches the current known note content, preventing self-save sync echoes from rewriting the active editor document.
- Track local edit/save revisions and defer remote `replaceBlocks(...)` while Korean IME composition, unsaved local edits, or in-flight saves are active.
- Ignore `onChange` fired by intentional remote document replacement so server sync does not immediately enqueue another local save echo.
- Use the normal autosave debounce after body IME completion instead of a very short save delay, reducing races between consecutive Korean syllable composition and socket sync refreshes.

## Validation

- Run `yarn build` in `flownote/`.
- Run repository-level `docker compose up -d --build`.
