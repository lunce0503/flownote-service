# Java Spring 규칙

- Java 17과 호환되는 언어 기능을 사용한다.
- 주변 코드가 그런 구조를 따른다면 controller는 HTTP 관심사에 집중하고 비즈니스 로직은 service로 옮긴다.
- 요청 body는 Spring validation annotation으로 검증한다.
- 스키마 변경은 Flyway migration을 사용한다.
- 하나의 repository/helper가 소유할 수 있는 SQL 가정을 여러 계층에 흩뿌리지 않는다.
- 생성자 주입을 우선한다.
- 기본 검증: `flownote-server/`에서 `./gradlew test` 실행.
