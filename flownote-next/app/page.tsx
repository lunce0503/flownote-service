const recentDocuments = [
  {
    title: "제품 회의록 정리",
    type: "회의록",
    updatedAt: "오늘 14:20",
    status: "편집 중",
  },
  {
    title: "논문 PDF 요약",
    type: "PDF",
    updatedAt: "어제 21:10",
    status: "검토 필요",
  },
  {
    title: "선형대수 강의 노트",
    type: "강의",
    updatedAt: "5월 8일",
    status: "완료",
  },
];

const quickActions = [
  { label: "새 노트", description: "빈 문서로 바로 시작", accent: "bg-emerald-500" },
  { label: "PDF 업로드", description: "파일을 읽고 요약 준비", accent: "bg-sky-500" },
  { label: "마크다운 가져오기", description: "기존 문서를 변환", accent: "bg-violet-500" },
  { label: "템플릿 선택", description: "목적에 맞는 구조 사용", accent: "bg-amber-500" },
];

const templates = [
  "회의록",
  "강의 노트",
  "연구 정리",
  "PDF 요약",
  "수식 문서",
];

const workspaceStats = [
  { label: "전체 문서", value: "28" },
  { label: "최근 업로드", value: "6" },
  { label: "즐겨찾기", value: "9" },
  { label: "진행 중", value: "4" },
];

export default function Home() {
  return (
    <main className="min-h-screen bg-[#f7f8fb] text-slate-950">
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-8 px-5 py-6 sm:px-8 lg:px-10">
        <header className="flex flex-col gap-5 border-b border-slate-200 pb-6 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <p className="text-sm font-medium text-emerald-700">Flownote</p>
            <h1 className="mt-2 text-3xl font-semibold tracking-normal text-slate-950 sm:text-4xl">
              작업을 바로 이어가세요
            </h1>
          </div>

          <div className="flex w-full flex-col gap-3 sm:flex-row lg:max-w-2xl">
            <label className="relative flex-1">
              <span className="sr-only">문서 검색</span>
              <span className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-sm text-slate-400">
                검색
              </span>
              <input
                className="h-12 w-full rounded-md border border-slate-200 bg-white pl-14 pr-4 text-sm outline-none transition focus:border-emerald-500 focus:ring-4 focus:ring-emerald-100"
                placeholder="제목, 내용, 태그 검색"
                type="search"
              />
            </label>
            <button className="h-12 rounded-md bg-slate-950 px-5 text-sm font-semibold text-white transition hover:bg-slate-800">
              새 문서
            </button>
          </div>
        </header>

        <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {workspaceStats.map((item) => (
            <div
              className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm"
              key={item.label}
            >
              <p className="text-sm font-medium text-slate-500">{item.label}</p>
              <p className="mt-3 text-3xl font-semibold text-slate-950">
                {item.value}
              </p>
            </div>
          ))}
        </section>

        <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_360px]">
          <section className="flex flex-col gap-4">
            <div className="flex items-center justify-between gap-4">
              <h2 className="text-xl font-semibold text-slate-950">최근 문서</h2>
              <a className="text-sm font-medium text-emerald-700" href="#">
                전체 보기
              </a>
            </div>

            <div className="grid gap-3">
              {recentDocuments.map((document) => (
                <article
                  className="grid gap-4 rounded-lg border border-slate-200 bg-white p-5 shadow-sm transition hover:border-emerald-200 hover:shadow-md sm:grid-cols-[1fr_auto] sm:items-center"
                  key={document.title}
                >
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="rounded-md bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-600">
                        {document.type}
                      </span>
                      <span className="text-xs text-slate-500">
                        {document.updatedAt}
                      </span>
                    </div>
                    <h3 className="mt-3 text-lg font-semibold text-slate-950">
                      {document.title}
                    </h3>
                  </div>
                  <div className="flex items-center justify-between gap-4 sm:justify-end">
                    <span className="text-sm font-medium text-slate-500">
                      {document.status}
                    </span>
                    <button className="h-10 rounded-md border border-slate-200 px-4 text-sm font-semibold text-slate-800 transition hover:border-slate-300 hover:bg-slate-50">
                      열기
                    </button>
                  </div>
                </article>
              ))}
            </div>
          </section>

          <aside className="flex flex-col gap-8">
            <section className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
              <h2 className="text-lg font-semibold text-slate-950">빠른 시작</h2>
              <div className="mt-4 grid gap-3">
                {quickActions.map((action) => (
                  <button
                    className="flex min-h-16 items-center gap-3 rounded-md border border-slate-200 px-4 text-left transition hover:border-slate-300 hover:bg-slate-50"
                    key={action.label}
                  >
                    <span
                      className={`h-3 w-3 shrink-0 rounded-full ${action.accent}`}
                    />
                    <span>
                      <span className="block text-sm font-semibold text-slate-950">
                        {action.label}
                      </span>
                      <span className="mt-1 block text-xs text-slate-500">
                        {action.description}
                      </span>
                    </span>
                  </button>
                ))}
              </div>
            </section>

            <section className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
              <h2 className="text-lg font-semibold text-slate-950">추천 템플릿</h2>
              <div className="mt-4 flex flex-wrap gap-2">
                {templates.map((template) => (
                  <button
                    className="rounded-md border border-slate-200 px-3 py-2 text-sm font-medium text-slate-700 transition hover:border-emerald-300 hover:bg-emerald-50 hover:text-emerald-800"
                    key={template}
                  >
                    {template}
                  </button>
                ))}
              </div>
            </section>
          </aside>
        </div>
      </div>
    </main>
  );
}
