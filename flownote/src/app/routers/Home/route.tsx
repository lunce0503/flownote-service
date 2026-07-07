import { TaskWidget } from "@/widgets";
import {
    BookOpen,
    Bot,
    CheckSquare,
    FileText,
    Palette,
    PenLine,
    Plus,
    Search,
    Users,
} from "lucide-react";
import { Link } from "react-router-dom";

const workspaceStats = [
    { label: "오늘의 작업", value: "Task", detail: "할 일과 마감일을 한 곳에서 확인" },
    { label: "문서 흐름", value: "Blog", detail: "노트와 글을 이어서 정리" },
    { label: "AI 도구", value: "Agent", detail: "요약과 자동화를 빠르게 실행" },
    { label: "캔버스", value: "Canvas", detail: "아이디어를 시각적으로 배치" },
];

const quickActions = [
    {
        label: "새 노트 작성",
        description: "생각을 바로 문서로 정리",
        href: "/blog",
        icon: PenLine,
    },
    {
        label: "작업 관리",
        description: "일정과 우선순위를 조정",
        href: "/task",
        icon: CheckSquare,
    },
    {
        label: "AI 에이전트",
        description: "문서 작업을 보조",
        href: "/agent",
        icon: Bot,
    },
    {
        label: "캔버스 열기",
        description: "아이디어를 자유롭게 배치",
        href: "/canvas",
        icon: Palette,
    },
];

const recentItems = [
    { title: "제품 회의록 정리", type: "회의록", updatedAt: "오늘", icon: FileText },
    { title: "강의 노트 초안", type: "노트", updatedAt: "어제", icon: BookOpen },
    { title: "팀 공유 내용", type: "소셜", updatedAt: "최근", icon: Users },
];

const Home = () => {
    return (
        <main className="min-h-screen bg-amber-50 text-stone-900">
            <div className="mx-auto flex w-full max-w-7xl flex-col gap-8 px-4 py-6 sm:px-6 lg:px-8">
                <section className="grid gap-6 border-b border-stone-200 pb-8 lg:grid-cols-[minmax(0,1fr)_380px] lg:items-end">
                    <div className="min-w-0">
                        <p className="text-sm font-semibold text-amber-700">Flownote Workspace</p>
                        <h1 className="mt-3 max-w-3xl text-3xl font-bold text-stone-900 sm:text-4xl">
                            오늘의 문서와 작업을 바로 이어가세요
                        </h1>
                        <p className="mt-4 max-w-2xl text-sm leading-6 text-stone-600 sm:text-base">
                            노트, 작업, 대화, 캔버스를 한 화면에서 이동할 수 있도록 정리했습니다.
                        </p>
                    </div>

                    <div className="flex w-full flex-col gap-3 sm:flex-row lg:flex-col">
                        <label className="relative flex-1">
                            <span className="sr-only">작업 검색</span>
                            <Search
                                aria-hidden="true"
                                className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-stone-400"
                                size={18}
                            />
                            <input
                                className="h-12 w-full rounded-lg border border-stone-200 bg-white pl-11 pr-4 text-sm text-stone-900 outline-none transition focus:border-amber-500 focus:ring-4 focus:ring-amber-100"
                                placeholder="문서, 작업, 태그 검색"
                                type="search"
                            />
                        </label>
                        <Link
                            className="inline-flex h-12 items-center justify-center gap-2 rounded-lg bg-stone-800 px-5 text-sm font-semibold text-amber-50 shadow-md transition hover:bg-stone-700"
                            to="/blog"
                        >
                            <Plus size={18} />
                            새 문서
                        </Link>
                    </div>
                </section>

                <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                    {workspaceStats.map((item) => (
                        <article
                            className="rounded-lg border border-stone-200 bg-white p-5 shadow-sm"
                            key={item.label}
                        >
                            <p className="text-sm font-medium text-stone-500">{item.label}</p>
                            <p className="mt-2 text-2xl font-bold text-stone-900">{item.value}</p>
                            <p className="mt-3 text-sm leading-5 text-stone-500">{item.detail}</p>
                        </article>
                    ))}
                </section>

                <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_360px]">
                    <section className="min-w-0">
                        <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
                            <div>
                                <p className="text-sm font-semibold text-amber-700">Task Board</p>
                                <h2 className="mt-1 text-2xl font-bold text-stone-900">진행 중인 작업</h2>
                            </div>
                            <Link
                                className="rounded-md border border-stone-300 bg-white px-3 py-2 text-sm font-semibold text-stone-700 transition hover:bg-stone-100"
                                to="/task"
                            >
                                전체 작업 보기
                            </Link>
                        </div>
                        <div className="-mx-4 sm:mx-0">
          <TaskWidget />
                        </div>
                    </section>

                    <aside className="flex flex-col gap-6">
                        <section className="rounded-lg border border-stone-200 bg-white p-5 shadow-sm">
                            <h2 className="text-lg font-bold text-stone-900">빠른 이동</h2>
                            <div className="mt-4 grid gap-3">
                                {quickActions.map((action) => {
                                    const Icon = action.icon;

                                    return (
                                        <Link
                                            className="flex min-h-16 items-center gap-3 rounded-md border border-stone-200 px-4 text-left transition hover:border-amber-300 hover:bg-amber-50"
                                            to={action.href}
                                            key={action.label}
                                        >
                                            <span className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-stone-800 text-amber-50">
                                                <Icon size={20} />
                                            </span>
                                            <span className="min-w-0">
                                                <span className="block text-sm font-semibold text-stone-900">
                                                    {action.label}
                                                </span>
                                                <span className="mt-1 block text-xs text-stone-500">
                                                    {action.description}
                                                </span>
                                            </span>
                                        </Link>
                                    );
                                })}
                            </div>
                        </section>

                        <section className="rounded-lg border border-stone-200 bg-white p-5 shadow-sm">
                            <h2 className="text-lg font-bold text-stone-900">최근 흐름</h2>
                            <div className="mt-4 grid gap-3">
                                {recentItems.map((item) => {
                                    const Icon = item.icon;

                                    return (
                                        <article
                                            className="flex items-start gap-3 rounded-md border border-stone-100 bg-stone-50 p-3"
                                            key={item.title}
                                        >
                                            <span className="mt-0.5 inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-amber-100 text-stone-700">
                                                <Icon size={17} />
                                            </span>
                                            <div className="min-w-0">
                                                <p className="truncate text-sm font-semibold text-stone-900">
                                                    {item.title}
                                                </p>
                                                <p className="mt-1 text-xs text-stone-500">
                                                    {item.type} · {item.updatedAt}
                                                </p>
                                            </div>
                                        </article>
                                    );
                                })}
                            </div>
                        </section>
                    </aside>
                </div>
            </div>
        </main>
    );
};

export default Home;
