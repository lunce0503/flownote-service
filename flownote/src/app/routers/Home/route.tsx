import { useMemo, useState } from "react";
import { Bot, CheckSquare, Palette, PenLine, Search } from "lucide-react";
import { Link } from "react-router-dom";

const destinations = [
    {
        label: "게시글 관리",
        description: "노트 작성과 폴더 정리",
        keywords: "노트 문서 블로그 글",
        href: "/blog",
        icon: PenLine,
    },
    {
        label: "플래너",
        description: "할 일, 시간표, 일기 관리",
        keywords: "일정 작업 달력 계획",
        href: "/planner",
        icon: CheckSquare,
    },
    {
        label: "AI 에이전트",
        description: "노트와 작업을 바탕으로 대화",
        keywords: "AI 요약 자동화 대화",
        href: "/agent",
        icon: Bot,
    },
    {
        label: "캔버스 열기",
        description: "아이디어를 자유롭게 배치",
        keywords: "그림판 필기 드로잉",
        href: "/canvas",
        icon: Palette,
    },
];

const Home = () => {
    const [query, setQuery] = useState("");
    const filteredDestinations = useMemo(() => {
        const normalizedQuery = query.trim().toLocaleLowerCase("ko");
        if (!normalizedQuery) return destinations;

        return destinations.filter((destination) => (
            `${destination.label} ${destination.description} ${destination.keywords}`
                .toLocaleLowerCase("ko")
                .includes(normalizedQuery)
        ));
    }, [query]);

    return (
        <main className="min-h-screen bg-amber-50 text-stone-900">
            <div className="mx-auto flex w-full max-w-6xl flex-col gap-8 px-4 py-6 sm:px-6 lg:px-8">
                <section className="border-b border-stone-200 pb-8">
                    <p className="text-sm font-semibold text-amber-700">Flownote</p>
                    <h1 className="mt-3 max-w-3xl text-3xl font-bold text-stone-900 sm:text-4xl">
                        작업을 선택하세요
                    </h1>
                    <p className="mt-3 max-w-2xl text-sm leading-6 text-stone-600 sm:text-base">
                        노트, 일정, 대화, 캔버스 중 이어서 작업할 기능을 찾을 수 있습니다.
                    </p>

                    <label className="relative mt-6 block max-w-2xl">
                        <span className="sr-only">기능 검색</span>
                        <Search
                            aria-hidden="true"
                            className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-stone-400"
                            size={18}
                        />
                        <input
                            aria-label="기능 검색"
                            className="h-12 w-full rounded-lg border border-stone-200 bg-white pl-11 pr-4 text-sm text-stone-900 outline-none transition focus:border-amber-500 focus:ring-4 focus:ring-amber-100"
                            placeholder="노트, 플래너, 캔버스 검색"
                            type="search"
                            value={query}
                            onChange={(event) => setQuery(event.target.value)}
                        />
                    </label>
                </section>

                <section aria-labelledby="workspace-destinations">
                    <h2 id="workspace-destinations" className="text-xl font-bold text-stone-900">
                        기능 바로가기
                    </h2>
                    {filteredDestinations.length > 0 ? (
                        <div className="mt-4 grid gap-3 sm:grid-cols-2">
                            {filteredDestinations.map((destination) => {
                                const Icon = destination.icon;
                                return (
                                    <Link
                                        className="flex min-h-24 items-center gap-4 rounded-lg border border-stone-200 bg-white p-4 transition hover:border-amber-300 hover:bg-amber-50 focus:outline-none focus:ring-4 focus:ring-amber-100"
                                        key={destination.href}
                                        to={destination.href}
                                    >
                                        <span className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-md bg-stone-900 text-amber-50">
                                            <Icon size={21} aria-hidden="true" />
                                        </span>
                                        <span className="min-w-0">
                                            <span className="block text-base font-semibold text-stone-900">{destination.label}</span>
                                            <span className="mt-1 block text-sm text-stone-500">{destination.description}</span>
                                        </span>
                                    </Link>
                                );
                            })}
                        </div>
                    ) : (
                        <p className="mt-4 rounded-lg border border-stone-200 bg-white p-6 text-sm text-stone-500" role="status">
                            일치하는 기능이 없습니다.
                        </p>
                    )}
                </section>
            </div>
        </main>
    );
};

export default Home;
