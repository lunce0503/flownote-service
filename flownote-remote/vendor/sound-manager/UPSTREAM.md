# Sound Manager 재사용

- 원본: https://github.com/lunce0503/sound_manger
- 고정 커밋: `792cdac30b436d9bbc92933d341316ad03cf0ded` (v0.3.0 계열)
- 라이선스: [MIT](LICENSE), Copyright (c) 2026 Lunce
- 가져온 범위: `src/SoundManager.Core/`의 Contracts, Mixer, AudioSource, Biquad 및 프로젝트 파일. 원본 그대로 보존한다(BOM 제외).
- 제외: LAN/loopback HTTP 서버, Quick Tunnel, QR 연결 키, Windows 캡처/출력, Android 캡처 서비스, 원본 앱 UI와 PairingLink.

Windows 앱은 이 코어를 프로젝트 참조로 사용한다. 아직 PCM 입력·오디오 출력 장치가 연결되지 않았으므로 시스템 소리는 바뀌지 않는다. Android는 같은 설정 계약만 공유한다. 원본 갱신 시 커밋·라이선스·API 호환성을 확인하고 필요한 파일만 갱신한다.
