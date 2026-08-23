# Mobile WAS Completion Audit

## Objective

모바일 환경에서도 작동하는 Expo 앱을 만들고, WAS를 설정 진입점으로 두어 백엔드에서 모바일 앱이 표시할 웹 URL을 관리한다.

## Prompt-to-artifact checklist

| Requirement | Evidence | Status |
| --- | --- | --- |
| 모바일 앱 생성 | `flownote-mobile/` Expo app scaffold, `App.tsx`, `index.js` | Implemented |
| WAS를 백엔드 관리 지점으로 둠 | `flownote-server/src/main/java/com/flownote/mobile/MobileConfigController.java` exposes `GET /api/mobile/config` | Implemented |
| 백엔드 설정으로 모바일 URL 관리 | `flownote-server/src/main/resources/application.yml` has `flownote.mobile.*`; `docker-compose.yml` passes `MOBILE_*` env vars | Implemented |
| 로컬/배포 환경 변수 예시 | `.env.example` documents `MOBILE_CORE_API_URL`, `MOBILE_AI_API_URL`, `MOBILE_WEB_URL`, `MOBILE_MIN_SUPPORTED_VERSION`, `MOBILE_ENABLED_FEATURES` | Implemented |
| 모바일 앱이 WAS 설정을 사용 | `flownote-mobile/src/api/client.ts` calls `/api/mobile/config`; `App.tsx` uses `config.web_url` for `react-native-webview` | Implemented |
| 백엔드 기능 플래그 관리 및 반영 | `application.yml` and `docker-compose.yml` expose `MOBILE_ENABLED_FEATURES`; `App.tsx` blocks WebView usage when `enabled_features` does not contain `webview` | Implemented |
| 백엔드 최소 지원 버전 반영 | `App.tsx` blocks app usage when `minimum_supported_version` is higher than the mobile app version | Implemented |
| iOS/Android WebView 앱 | `react-native-webview` dependency, `App.tsx` WebView container, Android hardware back handling, iOS back-forward gesture support | Implemented |
| 실기기 로컬 HTTP 접근 | `app.json` sets Android `usesCleartextTraffic`; iOS `NSAppTransportSecurity.NSAllowsArbitraryLoads`; README documents HTTPS for production | Implemented |
| 모바일 API 오류 처리 | `flownote-mobile/src/api/client.ts` handles non-JSON responses and extracts safe error messages | Implemented |
| 모바일 실행 문서 | `flownote-mobile/README.md`, `docs/mobile-was-architecture.md` | Implemented |
| 모바일 Node 버전 고정 | `flownote-mobile/.nvmrc`, `package.json` engines, and CI all target Node 20.19+ | Implemented |
| 모바일 권한 최소화 | `flownote-mobile/app.json` sets Android `permissions` to an empty array | Implemented |
| 루트 검증 스크립트 | `scripts/verify-mobile-was.sh` runs mobile static checks, compose config, Spring contract test, lockfile check, and Expo typecheck gates | Implemented |
| CI 검증 워크플로 | `.github/workflows/mobile-was.yml` reproduces the Java/Node/mobile verification gates in GitHub Actions | Added, not executed |
| WAS 모바일 계약 테스트 | `MobileConfigControllerTest.java` validates response fields, snake_case JSON contract, and default enabled features | Added, not executed |

## Verification performed

| Command | Result | Notes |
| --- | --- | --- |
| `cd flownote-mobile && yarn verify:contract` | Passed | Confirms mobile app loads WAS config and renders `web_url` in WebView |
| `cd flownote-mobile && yarn verify` | Passed | Runs contract and local type checks available before dependency install, including WebView dependency/config checks, package/app/app.json runtime version sync, and semantic minimum-version comparison |
| `cd flownote-mobile && node -e "...JSON.parse..."` | Passed | Confirms mobile JSON manifests are valid |
| `cd flownote-mobile && ../flownote/node_modules/.bin/esbuild index.js ...` | Passed with warning | Bundles local mobile entry; warning is due to missing `expo/tsconfig.base` before dependency install |
| `cd flownote-mobile && yarn verify:local-types` | Passed | Uses mobile TypeScript when dependencies are installed, otherwise falls back to existing Vite app TypeScript plus local `expo`/`react-native`/`react-native-webview` shims; does not replace real Expo typecheck |
| `docker compose config --services` | Passed | Confirms compose syntax can be resolved |
| `./scripts/verify-mobile-was.sh` | Blocked after partial pass | Mobile static verification and compose config pass; script reports missing mobile lockfile, missing Java, missing mobile `node_modules`, and a final failed-gates summary |
| `.github/workflows/mobile-was.yml` | Added, not executed | CI uses read-only repository permissions, prepares Java 17 and Node.js 20.19, checks that the mobile lockfile exists, installs dependencies with `--frozen-lockfile`, then runs `./scripts/verify-mobile-was.sh`; no remote run result is available in this workspace |
| `cd flownote && yarn build` | Passed | Confirms existing Vite app still builds |
| `cd flownote-server && ./gradlew test --tests com.flownote.mobile.MobileConfigControllerTest` | Blocked | `JAVA_HOME` is not set and `java` is missing |
| `cd flownote-mobile && yarn typecheck` | Blocked | `flownote-mobile/node_modules` is missing, so `tsc` is unavailable |
| `cd flownote-mobile && yarn install --offline --non-interactive` | Blocked | Expo SDK dependency is not available in the local Yarn cache, so lockfile generation requires network access |
| `docker compose up -d --build` | Not run | Deferred until Java and mobile typecheck gates pass; Docker daemon access was previously unavailable in this environment |

## Remaining gates

These gates must pass in an environment with Java 17 and mobile dependencies installed before the objective should be considered fully verified.

Current environment check: `java` is not available, `flownote-mobile/node_modules` is missing, and `flownote-mobile/yarn.lock` is not present locally.

After the first successful mobile dependency install, commit `flownote-mobile/yarn.lock` for reproducible installs.
After committing the lockfile, add `flownote-mobile/yarn.lock` to the GitHub Actions `cache-dependency-path`.

```bash
cd flownote-server
./gradlew test --tests com.flownote.mobile.MobileConfigControllerTest
```

```bash
cd flownote-mobile
yarn install
yarn typecheck
```

```bash
docker compose up -d --build
```
