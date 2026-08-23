# Agent Tool Log Warning - 2026-05-23

## Symptom

`api-server` Docker logs showed:

```text
Warning: there are non-text parts in the response: ['function_call'], returning concatenated text result from text parts.
```

## Cause

The FastAPI agent flow used Gemini SDK convenience access for function-call detection. When a Gemini response contains a `function_call` part, text-oriented response access can emit a warning because the response is not purely textual.

## Fix

- Split MCP tool code under `flownote-API/mcpServers/`.
- Moved tool registry and `tool_map` to `mcpServers/registry.py`.
- Updated `AgentService` to inspect `candidates[].content.parts[].function_call` directly instead of relying on text-oriented convenience access.

## Verification

- `cd flownote-API && uv run python -m compileall app mcpServers mcp_servers`
- `cd flownote-API && uv run python - <<'PY' ...` registry smoke check
- `docker compose up -d --build`
- `docker compose logs --tail 120 api-server | rg -n "ERROR|Error|Exception|Traceback|Warning|warning|function_call|ModuleNotFound" || true`

The final log scan returned no matches after rebuild and restart.
