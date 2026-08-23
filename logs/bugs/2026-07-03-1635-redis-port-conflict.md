# Redis Port Conflict During Docker Verification

- Symptom: `docker compose up -d --build` built images successfully, then failed while starting `flownote-redis`.
- Error: host port `6379` was already allocated.
- Cause: existing `village-finance-redis` container was bound to `0.0.0.0:6379`.
- Fix direction: rerun Flownote compose with `REDIS_HOST_PORT=6380` to keep the existing Redis container untouched.
- Verification: `REDIS_HOST_PORT=6380 docker compose up -d --build` completed and `flownote-redis` became healthy on `6380->6379`.
