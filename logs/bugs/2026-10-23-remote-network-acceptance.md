# 원격 네트워크 기능 검증 중 발견한 오류

- 범위: `flownote-remote` 0.2.0의 PC 서버/Android·Windows 클라이언트. 다른 웹·인증 변경과 분리한다.
- `dotnet run --project tests/Flownote.Remote.Network.Checks -c Release`: Minimal API POST 핸들러가 RequestDelegate로 추론되어 IResult가 버려지면 등록 응답 JSON이 비게 된다. `MapPost`에 Delegate 핸들러를 명시해 실제 HTTPS 등록 검사로 확인했다.
- Android instrumentation 빌드: AndroidX 테스트 의존성 추가 후 `android.useAndroidX=true` 누락으로 빌드가 중단됐다. Gradle 속성을 추가하고 단위/lint/기기 검사 APK 컴파일을 통과했다.
- Windows Actions 39954489735: `dotnet run --project tests/Flownote.Remote.Windows.Checks -c Release`가 .NET SDK 10.0.402에서 NU1510 경고의 오류 처리로 중단됐다. Windows 프레임워크가 제공하는 ProtectedData의 중복 NuGet 참조를 제거한다. 후속 Actions 실행에서 실제 모델/TTS와 EXE 시작을 재검증한다.
- Windows Actions 39954784166: 코어/네트워크/실제 모델/TTS는 통과했으나 EXE의 서버 시작이 실패했다. 새 인증서를 재내보내 DPAPI에 보관하는 경로를 추가 검사한다. Windows의 기본 PFX import는 재내보내기를 허용하지 않아 Exportable을 명시한다. EXE 검사는 실패 단계/예외 타입을 기록하며 지문·코드·토큰은 출력하지 않는다.
- Windows Actions 39955491970: EphemeralKeySet을 함께 사용하면 Windows TLS handshake가 EOF로 중단됐다. [Microsoft의 Schannel 설명](https://learn.microsoft.com/en-us/dotnet/core/extensions/sslstream-troubleshooting#handshake-failed-with-ephemeral-keys)에 따라 기본 사용자 키 핸들과 Exportable을 사용한다. PFX 영구 보관은 CurrentUser DPAPI 암호화 파일로 유지한다. 실제 Windows HTTPS 및 EXE 시작 검사를 다시 통과해야 배포한다.
- 등록 해제는 활성 소켓 중단과 토큰 폐기를 함께 수행한다. handshake 도중 해제된 기기가 연결되는 경쟁을 차단하고, 등록 변경과 암호화 저장 콜백을 같은 잠금으로 순서화해 오래된 목록이 마지막에 저장되지 않도록 했다. 해제한 자격 증명 재접속 거부도 검사한다.
- 공개 Thumb_Up 시험 이미지는 실제 모델에서 약 74.6%를 반환한다. 제품 기본 80%에서는 차단하는 것이 정상이다. 기본 정책을 낮추지 않고 수용 테스트의 서버 설정에만 70%를 사용한다. Windows 검사에서 기본 정책 차단도 먼저 확인한다.
- Linux 호스트 Chromium 실행은 libatk 부재로 실패했다. 호스트 패키지를 바꾸지 않고 공식 Playwright 컨테이너로 실제 모델 판정을 확인했다. Actions는 공식 Playwright 브라우저/의존성을 설치한다.
- 후속: 최종 Actions 결과와 공개 APK/EXE 검증은 같은 날짜의 작업 보고서에 기록한다. 물리 카메라·스피커·Bluetooth와 VPN 지연 검증은 에뮬레이터/시험 어댑터 결과와 구별한다.
