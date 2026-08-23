# Blog note save race and rewrite loop

## Symptom

- Rapid edits could disappear and reappear after autosave.
- A saved note could be written again repeatedly after receiving its own sync event.
- Korean IME edits increased the frequency because multiple editor changes occurred around composition completion.

## Root cause

- Autosave requests were allowed to overlap, so an older request could finish after a newer request.
- Every save overwrote the same object-storage key without a revision precondition.
- Sync events contained no note ID, revision, or originating browser ID, so the saving editor reloaded its own event.
- Title, page-leave, drawing, and body saves used separate write paths.

## Resolution

- Use a single-flight, latest-wins client queue. While one request is active, newer edits replace one pending snapshot.
- Add a monotonic note revision and client ID to the Spring request/response contract.
- Reject stale revisions with HTTP 409 and rebase the pending local document on the current server revision.
- Store each revision under a client-isolated object key before atomically changing the database pointer.
- Include note ID, revision, and client ID in sync events and ignore events from the same browser session.
- Route title, body, drawing, visibility, and page-leave flushes through the same queue.

## Validation

- `flownote-server/`: `./gradlew test`
- `flownote/`: `yarn build`
- `flownote-next/`: `yarn build` and source-only ESLint
- `flownote-mobile/`: `npx tsc --noEmit`
- `flownote-API/`: `uv run python -m unittest discover -s tests -v`
- Repository root: `docker compose up -d --build`
