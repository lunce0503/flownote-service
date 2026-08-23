# Agent Tool Integration - 2026-05-23

## Summary

- Connected the FastAPI agent flow to Gemini function declarations in `flownote-API/mcp_servers/planner_mcp.py`.
- Replaced the previous Planner MCP placeholder responses with Spring Core API-backed tool handlers.
- Forwarded the browser `Authorization` header from `/api/aiclient/ask_stream` to Spring Core API tool calls.
- Refreshed the Vite Agent workspace after agent responses so created or updated resources appear in the Agent tab.

## Exposed Agent Tools

- `get_task_list`
- `add_task_item`
- `update_task_item`
- `delete_task_item`
- `get_schedule_items`
- `add_schedule_item`
- `get_note_list`
- `add_note`

## Validation

- `cd flownote-API && uv run python -m compileall app mcp_servers`
- `cd flownote-API && uv run python - <<'PY' ...` tool declaration smoke check
- `cd flownote && yarn build`
- `cd flownote-server && ./gradlew --project-cache-dir /tmp/flownote-server-gradle-cache -Dorg.gradle.project.buildDir=/tmp/flownote-server-build test`
- `docker compose up -d --build`
- `docker compose ps`
- `curl -fsS http://localhost:8000/`
- `curl -fsS http://localhost:8080/api/health`

## Notes

- The default `./gradlew test` failed before compilation because local generated Gradle/cache files under `flownote-server/.gradle` and `flownote-server/build` were not deletable by the current process. The same tests passed when Gradle project cache and build output were redirected to `/tmp`.
- The first FastAPI root curl immediately after container startup returned a transient connection reset. Uvicorn logs showed successful startup, and the retry returned `{"message":"Hello, World!"}`.
