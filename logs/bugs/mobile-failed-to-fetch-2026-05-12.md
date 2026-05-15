# Mobile Failed to Fetch

## Symptom

Expo mobile app shows:

```text
Server: http://192.168.0.18:8080
Failed to fetch
```

The failure happens while the mobile app calls:

```text
GET http://192.168.0.18:8080/api/mobile/config
```

## Observed Checks

From this workspace, Docker logs could not be read because the current user cannot access the Docker socket:

```text
permission denied while trying to connect to the docker API at unix:///var/run/docker.sock
```

The local Spring endpoint was also not reachable:

```text
curl -sS -m 5 http://127.0.0.1:8080/api/mobile/config
curl: (7) Failed to connect to 127.0.0.1 port 8080
```

This means the immediate observable cause is that the Spring WAS is not reachable on port `8080` from the host environment. Because the phone is trying to reach `192.168.0.18:8080`, it will fail if the host itself is not serving that port.

## Likely Causes

1. `spring-server` container is not running or failed during startup.
2. Docker Compose was started without `spring-server`.
3. The database container is unhealthy, so Spring is waiting or failed to start.
4. `192.168.0.18` is not the current LAN IP of the development machine.
5. A firewall or network isolation rule blocks phone-to-PC access on port `8080`.
6. Phone and development PC are not on the same LAN.

## Fix Plan

Run these on the development machine.

### 1. Confirm the LAN IP

```bash
ip route get 1.1.1.1 | awk '{print $7; exit}'
```

Use that IP as `HOST_LAN_IP`. If it is not `192.168.0.18`, restart Compose with the correct value.

### 2. Start required services in detached mode

```bash
cd /home/kwon/Flownote/service
HOST_LAN_IP=192.168.0.18 docker compose up -d --build db spring-server react-app mobile-app
```

If the detected IP is different, replace `192.168.0.18`.

### 3. Check container status

```bash
docker compose ps
```

`db`, `spring-server`, and `mobile-app` should be running. If `spring-server` exits, inspect:

```bash
docker compose logs --tail=200 spring-server
docker compose logs --tail=200 db
```

### 4. Verify the Spring mobile config endpoint from the PC

```bash
curl -v http://127.0.0.1:8080/api/mobile/config
curl -v http://192.168.0.18:8080/api/mobile/config
```

Both should return JSON with fields like `core_api_url`, `ai_api_url`, `web_url`, `minimum_supported_version`, and `enabled_features`.

### 5. Verify from the phone

Open the phone browser and visit:

```text
http://192.168.0.18:8080/api/mobile/config
```

If the PC curl works but the phone browser fails, the issue is network/firewall, not the Expo app.

### 6. Restart the mobile app with the same LAN IP

```bash
HOST_LAN_IP=192.168.0.18 ./scripts/docker-mobile-up.sh
docker compose logs -f mobile-app
```

Scan the Expo QR again.

## Notes

- `localhost` must not be used from a physical phone. It points to the phone itself, not the development PC.
- Native React Native fetch is not blocked by browser CORS, so this specific `Failed to fetch` is usually reachability, wrong IP, blocked port, or backend-not-running.
- The current app uses direct native API calls, not WebView.

## 2026-05-12 Follow-up

Expo Web was opened from:

```text
http://192.168.0.18:8081
```

The Spring API rejected that browser origin:

```text
HTTP/1.1 403
Invalid CORS request
```

Fix applied:

- Added `http://192.168.0.18:8081` and `http://localhost:8081` to `CORS_ORIGINS`.
- Updated `docker-compose.yml`, `.env.example`, and `.env`.
- Recreated `spring-server`, `api-server`, and `mobile-app`.
- Confirmed the request now returns `200` with `Access-Control-Allow-Origin: http://192.168.0.18:8081`.
- Normalized `/api/mobile/config` snake_case response fields in the mobile client.

## 2026-05-12 Runtime Error Follow-up

After CORS was fixed, Expo Web showed:

```text
Cannot read properties of undefined (reading 'join')
```

Root cause:

- Spring returns `enabled_features`.
- The mobile screen read `config.enabledFeatures.join(...)`.
- The source code was fixed to normalize the field, but the Docker image still had the old copied source because `flownote-mobile/Dockerfile` uses `COPY . .`.

Fix applied:

```bash
docker compose up -d --build mobile-app
```

Confirmed:

- `mobile-app` and `spring-server` are running.
- `/api/mobile/config` returns `200`.
- CORS allows `http://192.168.0.18:8081`.
