# QR pairing v1

Host 0.3.0 이상과 Android 0.2.0 이상이 지원한다. 기존 WSS 터미널 v1은 변경하지 않는다.

## 발급

사용자 전용 IPC에서 `{"action":"pair","name":"Work PC"}`를 요청한다. CLI는 `remote-host pair --name "Work PC"`로 QR을 터미널에 표시하며 `--qr-file PATH`로 새 PNG 파일(0600)을 추가 저장할 수 있다. 기존 파일은 덮어쓰지 않는다. `--json`은 QR의 JSON 원문을 출력한다. 일반 서비스 로그에는 코드를 기록하지 않는다.

QR JSON은 아래 필드만 포함한다.

| 필드 | 형식 |
| --- | --- |
| type | `flownote-remote-pairing` |
| version | 정수 `1` |
| name | PC 표시 이름, 1-80자, 제어 문자 금지 |
| endpoint | `wss://<host>:<port>/v1/connect`, 사용자정보/쿼리/fragment 없음 |
| certificateFingerprint | 등록할 서버 인증서 전체 DER의 SHA-256 지문 |
| pairingCode | 32 random bytes의 base64url, 43자 |
| expiresAt | 발급 후 5분의 ISO-8601 UTC 시각 |

영구 기기 토큰은 QR에 넣지 않는다. 서버는 코드의 SHA-256 해시와 만료 시각만 메모리에 유지한다. 새 발급은 이전 코드를 무효화하고, Host 재시작으로도 코드가 사라진다.

## 교환

앱은 스캔 직후 접속하지 않는다. 주소·지문을 표시하고 사용자가 PC 지문과 일치함을 확인한 뒤에만 QR의 목적지와 같은 host/port의 HTTPS `POST /v1/pair`로 요청한다. 인증서 지문/유효 기간/호스트명을 모두 검증하고 redirect를 따르지 않는다. 코드 또는 토큰을 URL에 넣지 않는다.

`Content-Type: application/json`, 본문 최대 2KiB, 전송 제한 10초. 유일한 필드는 `pairingCode`다. 서버 인증 실패 제한을 공유한다.

성공 응답은 HTTP 200, JSON `{version:1,deviceId:string,token:string}`다. 신규 deviceId와 scrypt 해시를 기존 설정에 원자적으로 저장하고, 원문 기기 토큰은 이 응답으로만 전달한다. 앱은 검증된 QR 주소/지문과 응답 토큰을 PC 목록에 암호화 저장한다. 기존 등록 기기와 실행 중인 PTY는 변경하지 않는다.

- 400: 잘못된 JSON/필드.
- 401: 잘못된 코드, 만료 또는 재사용. 코드는 성공 시 한 번만 교환할 수 있다.
- 409: 기기 최대 16개 제한.
- 413/415: 본문 제한/Content-Type 위반.
- 429: 인증 실패 제한.
- 500: 저장 또는 내부 오류. 내부 경로/코드/토큰을 오류에 포함하지 않는다.

제한: LAN 또는 기존 VPN 직접 연결만 지원한다. QR은 근처에서 사용자가 생성·스캔하는 bearer 등록 코드이며, 지문 대조를 생략하는 자동 신뢰/인증 수단이 아니다. PC가 여러 대여도 각 Host의 단일 writer/PTY 정책은 유지한다.
