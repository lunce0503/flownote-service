# 상시 메모리 절감 및 Railway 서비스명 변경

## 결과

- Railway 서비스 ID `df778cd1-93d2-4ef2-a867-c9da5ee028af`의 표시 이름을 `flownote-serve`에서 `flownote-sub`로 변경했다. 소스 디렉터리, Go module, 바이너리 이름은 호환성을 위해 `flownote-serve`로 유지한다.
- staging의 모든 앱 서비스에 Railway Serverless를 적용했다. 최종 활성 manifest에서 `flownote-main`, `flownote-canvas`, `flownote-sub`, `flownote-api`가 모두 `sleepApplication=true`임을 확인했다.
- production에서 중지된 `flownote-ai`, 모바일 정적 웹, Expo Go를 staging에서도 `REMOVED` 상태로 맞췄다. 기본 `all` 배포에서도 이 세 서비스를 제외한다.
- production에서 가동 중인 앱 서비스는 `sleepApplication=false`를 유지한다. PostgreSQL과 Redis는 양쪽 환경에서 계속 가동한다.
- Spring JVM을 `-Xms32m -Xmx256m`, Serial GC로 제한하고 Hikari의 환경별 최소/최대 연결 수와 idle timeout을 축소했다.
- AI의 무거운 Google GenAI 및 시장 데이터 모듈은 첫 실제 요청 시 import하도록 변경하고 사용하지 않는 직접 의존성을 제거했다.
- Expo Go는 worker 1개, Node old-space 384MiB로 제한했다. 256MiB는 최초 번들 생성 중 OOM이 발생해 384MiB로 보정했다.
- AI가 내려가도 `/api/capabilities`와 제거된 `/api/agent-note/**` 계약이 유지되도록 gateway가 disabled/410 호환 응답을 직접 제공한다.

## 메모리 관측

staging 배포 전 앱·데이터 서비스 합계는 약 1,333MB였다. 최종 배포 직후 관측 합계는 약 515MB로 약 818MB(61%) 감소했다.

| staging 서비스 | 변경 전 | 최종 배포 직후 | 정책 |
| --- | ---: | ---: | --- |
| Expo Go | 546.6MB | 0MB | production과 함께 중지 |
| main | 433.0MB | 330.3MB | Serverless, JVM/DB pool 축소 |
| AI | 148.3MB | 0MB | production과 함께 중지 |
| API gateway | 71.8MB | 72.9MB | Serverless |
| canvas | 14.6MB | 19.5MB | Serverless |
| sub | 19.5MB | 12.4MB | Serverless |
| 모바일 정적 웹 | 19.5MB | 0MB | production과 함께 중지 |
| PostgreSQL + Redis | 79.4MB | 79.6MB | 상시 가동 |

Serverless는 마지막 outbound traffic 이후 통상 5~10분 뒤 잠든다. 배포/E2E 직후에는 앱 4개가 깨어 있었으며, 완전 유휴 시 데이터 계층 약 80MB만 상시 남는 구성을 목표로 한다. DB 연결이나 telemetry 같은 outbound traffic이 있으면 실제 sleep이 지연될 수 있다.

production은 배포 전 약 764MB에서 배포 직후 약 530MB로 감소했다. production의 AI·모바일·Expo는 기존 중지 상태를 유지했다.

## 최종 배포

### staging

- `flownote-main`: `421aad0d-ea31-48cb-ad41-03643d4155aa`
- `flownote-canvas`: `a0bdcab1-ea1d-44a2-a649-00878dc2aa99`
- `flownote-sub`: `13cf258c-a019-4696-a974-6b968c9fcd49`
- `flownote-api`: `fdabba21-83d3-43e9-9ea9-403f4e5c6fd7`
- web: `https://flownote-react-staging-mwh17aanw-flownote-service.vercel.app`
- cloud Playwright E2E: 11/11 통과

### production

- `flownote-main`: `4d2bcfcd-3bf1-444e-8995-48f6608661cc`
- `flownote-canvas`: `6f2d786f-3b16-47d6-857b-cbdc79c1671e`
- `flownote-sub`: `9ae23a28-a5f5-4d1e-94ad-81f1f1c68e49`
- `flownote-api`: `6e5ef6f4-854e-461f-9332-43324c78d099`
- web: `https://flownote-react-bwjvzla3i-flownote-service.vercel.app`
- production smoke: 통과

## 검증

- `./scripts/verify-services.sh all`: 통과
  - Vite typecheck/build
  - gateway pytest 25개
  - Spring Gradle test
  - canvas 및 sub Go test
  - AI pytest 4개
  - 모바일 lint/typecheck/test 5개/web export
  - cloud configuration check
- `node --test scripts/cloud-resource-policy.test.mjs`: 5개 통과
- `uv lock --check` (`flownote-ai/`): 통과
- `git diff --check`: 통과

## 배포 중 확인한 실패와 조치

- Expo Go old-space 256MiB에서 최초 bundle 생성이 OOM으로 실패했다. worker 1개는 유지하고 old-space만 384MiB로 조정한 뒤 배포가 성공했다.
- Expo 후속 smoke에서 gateway가 한 차례 502를 반환했으나 즉시 재검증 시 정상 401이었다.
- AI를 중지한 첫 E2E에서 `/api/capabilities`가 502가 됐다. 해당 호환 계약을 gateway로 이동하고 테스트를 추가했다.
- gateway `railway.json`의 고정 `sleepApplication=false`가 환경 정책을 덮어쓰는 것을 발견했다. 고정값을 제거하고 모든 서비스 manifest에 대한 회귀 테스트를 추가했다.

보고서 작성은 최종 staging 검증과 production 승격 이후 수행했으므로 별도 재배포하지 않았다.
