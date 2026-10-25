# Android 골격 분석 뒤 미리보기 비트맵 해제

- 증상: 새 SkeletonTracker의 detect 호출 뒤 반환한 관절은 정상이나 원본 미리보기 Bitmap은 recycled 상태가 된다. 이후 ImageView/Canvas에서 사용할 때 예외가 발생할 수 있다.
- 원인: MediaPipe Tasks Core 1.1.1의 BitmapImageContainer.close가 전달받은 bitmap.recycle()을 호출한다. 로컬 의존성의 javap 바이트코드로 확인했다.
- 재현: 실제 네이티브 모델에 BitmapImageBuilder(bitmap)를 전달하고 MPImage.close 후 bitmap.isRecycled()를 확인한다.
- 수정: 분석용 ARGB_8888 복사본을 MPImage가 소유하고 정리하게 하며 클라이언트 미리보기 원본을 보존한다.
- 검증: Android NetworkDeviceTest에 실제 모델 호출 후 원본 isRecycled=false 회귀 검사를 추가했다. 단위 테스트가 아닌 Android 계측 런타임에서 확인한다.

## 손 관절 뼈대가 빈 화면으로 보이는 문제

- 증상: 실제 hand 모델은 21점을 반환하지만 overlay 픽셀이 모두 투명해 `tests/skeleton-camera-checks.mjs`의 실제 그리기 검사가 실패했다.
- 원인: Hand Landmarker는 관절별 visibility를 제공하지 않는데 JavaScript protobuf 기본 0을 가림 상태/신뢰도로 해석했다.
- 수정: 손 관절의 미제공 visibility를 생략하고 좌표를 그리며, pose의 실제 visibility는 유지한다. 미제공 값을 추적 확률로 표시하지 않는다.
- 검증: 실제 공개 손 이미지의 관절 21점과 overlay 비투명 픽셀 검사가 통과했다. 네이티브 Android도 실제 모델 뒤 Bitmap 보존과 뼈대 그리기 검사를 통과했다. 최종 staging 실행은 40148957200이다.
