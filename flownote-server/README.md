# Flownote Spring Server

Main backend server for Flownote.

## Run with Docker Compose

From the repository root:

```bash
docker compose up spring-server
```

The server listens on `http://localhost:8080`.

## Endpoints

- `GET /api/health`
- `GET /api/tasks`
- `POST /api/tasks`
- `PATCH /api/tasks/{id}`
- `DELETE /api/tasks/{id}`

The task JSON shape intentionally matches the existing Next.js API fields:

```json
{
  "id": "task-id",
  "task_name": "Write migration plan",
  "category": "backend",
  "difficulty_level": 2,
  "status": "todo",
  "estimated_minutes": 60,
  "actual_minutes": null,
  "due_date": "2026-05-02",
  "memo": "optional",
  "tags": ["spring", "api"]
}
```

## Environment

Required database settings can be supplied with either `SPRING_DATASOURCE_*`
variables or the existing `DATABASE_URL`.

```bash
SPRING_DATASOURCE_URL=jdbc:postgresql://db:5432/flownote
SPRING_DATASOURCE_USERNAME=lunce
SPRING_DATASOURCE_PASSWORD=...
```
