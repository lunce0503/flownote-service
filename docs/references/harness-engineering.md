# 하네스 엔지니어링 (Harness Engineering) — 참조 요약

- 출처: OpenAI, "Harness engineering" — https://openai.com/ko-KR/index/harness-engineering/
- 성격: LLM/에이전트를 위한 참조 가이드. 위 원문은 자동 요청(WebFetch)이 403으로 차단되어, **공유된 상세 요약을 기준으로 구조화**했다. 원문과 표현이 다를 수 있으며, 충돌 시 원문을 기준으로 판단한다.
- 용도: Flownote의 `docs/` 지식 저장소를 "기록 시스템(System of Record)"으로 유지하는 근거 문서. 실제 적용 규칙은 `AGENTS.md`/`CLAUDE.md`의 "지식 저장소" 절과 `docs/README.md`를 따른다.

## 1. 핵심 개념

**하네스 엔지니어링**은 에이전트(예: Codex)가 부담 없이 점진적으로 컨텍스트를 파악하도록, 리포지토리를 **구조화된 지식 저장소**로 설계·운영하는 실천이다.

> 에이전트 우선 세계에서 "볼 수 없는 것은 존재하지 않는 것"과 같다. Slack 대화나 사람의 머릿속 지식을 배제하고, 모든 컨텍스트를 리포지토리 안에 **일반 텍스트와 구조화된 마크다운으로 인코딩**하여 **점진적으로 노출(Incremental Disclosure)** 한다.

## 2. System of Record로서의 `docs/` 구조

지식 저장소는 분류·색인된 마크다운/텍스트 파일로 구성된다.

```text
AGENTS.md         # 최상위 맵(목차 역할, ~100 라인). 백과사전이 아니라 지도.
ARCHITECTURE.md   # 도메인 및 패키지 레이어링의 최상위 맵
DESIGN.md         # 디자인 시스템 및 아키텍처 원칙
FRONTEND.md       # 프론트엔드 지침
PLANS.md          # 전반적 계획 및 진행 상황
PRODUCT_SENSE.md  # 제품 관점 및 원칙
QUALITY_SCORE.md  # 제품 도메인/아키텍처 레이어 등급·격차 추적
RELIABILITY.md    # 플랫폼별 안정성 요구 사항
SECURITY.md       # 보안 규범 및 제약

docs/
├── design-docs/   # 설계 문서화
│   ├── index.md
│   ├── core-beliefs.md   # 검증 상태·에이전트 우선 운영 원칙
│   └── ...
├── exec-plans/    # 일급 아티팩트로 취급되는 실행 계획
│   ├── active/           # 진행 중 계획
│   ├── completed/        # 완료 계획 및 의사결정 로그
│   └── tech-debt-tracker.md   # 알려진 기술 부채 추적
├── generated/     # 자동 생성 문서
│   └── db-schema.md      # DB 스키마
└── references/    # LLM/에이전트용 참조 가이드
    ├── design-system-reference-llms.txt
    ├── nixpacks-llms.txt
    └── uv-llms.txt
```

## 3. 진입점은 "맵"이다 — `AGENTS.md`

- 방대한 단일 매뉴얼(Monolithic manual) 대신 **짧은(~100 라인) 목차**를 둔다.
- 에이전트 최초 실행 시 컨텍스트에 삽입되어, **더 깊고 신뢰할 수 있는 소스(디렉터리 내 다른 문서)의 위치**를 안내한다.
- 자체가 백과사전이 되지 않도록 유지한다.

## 4. 점진적 노출 (Incremental Disclosure)

- 모든 것을 처음부터 읽히지 않는다. 맵에서 시작해 **작업에 필요한 문서만** 따라 들어간다.
- 각 문서는 자족적이고 단일 소유자를 가진다. 그래서 에이전트가 외부 상황에 의존하지 않고 독립적으로 작업할 수 있다.

## 5. 실행 계획의 아티팩트화 (`exec-plans/`)

- 복잡한 작업은 진행 상황·의사결정 로그·기술 부채(`tech-debt-tracker.md`)를 모두 **버전 관리되는 문서**로 저장한다.
- `active/` → 진행 중, `completed/` → 완료 및 의사결정 로그.

## 6. 품질 문서 (`QUALITY_SCORE.md`)

- 각 제품 도메인·아키텍처 레이어에 **지속적으로 등급**을 매긴다.
- 시간이 지나며 생기는 **아키텍처 격차를 추적**한다.

## 7. 기계적 관리 및 자동 최적화

- 지식 베이스 최신성과 **교차 링크 정합성**을 위해 **전용 린터(Linter)와 CI 작업**을 실행한다.
- 주기적으로 **"doc-gardening" 에이전트**가 실제 코드 동작과 어긋난 오래된 문서를 찾아 **직접 PR을 열어** 정정한다.

## 8. 핵심 요약

- 컨텍스트는 사람 머릿속·채팅이 아니라 **리포지토리 안 평문/구조화 마크다운**에 인코딩한다.
- 진입점은 **짧은 맵**, 깊이는 **소유 문서**로 위임한다(점진적 노출).
- 계획·품질·부채를 **버전 관리 아티팩트**로 남겨 에이전트가 독립적으로 일하게 한다.
- 문서 정합성은 **린터·CI·doc-gardening**으로 기계적으로 유지한다.
