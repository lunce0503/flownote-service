import { useCallback, useEffect, useMemo, useState } from "react";
import { MessageSquare, RefreshCw, Inbox, Filter, Search } from "lucide-react";
import { Navigate } from "react-router-dom";
import { useAuth } from "@/features/auth";
import { listAllFeedback, FEEDBACK_CATEGORIES, type FeedbackItem } from "@/entities/feedback";

// 관리자 전용 사용자 피드백 확인 화면.
// 데이터는 flownote-serve의 GET /api/feedback/all(AdminMiddleware)이 소유한다.
const AdminFeedbackRoute = () => {
  const { user } = useAuth();
  const [items, setItems] = useState<FeedbackItem[]>([]);
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  const [error, setError] = useState("");
  const [category, setCategory] = useState<string>("전체");
  const [keyword, setKeyword] = useState("");

  const load = useCallback(async () => {
    setStatus("loading");
    setError("");
    try {
      setItems(await listAllFeedback());
      setStatus("ready");
    } catch (loadError) {
      console.error("피드백 목록 불러오기 실패:", loadError);
      setError(loadError instanceof Error ? loadError.message : "피드백을 불러오지 못했습니다.");
      setStatus("error");
    }
  }, []);

  useEffect(() => {
    const run = async () => { await load(); };
    void run();
  }, [load]);

  const filtered = useMemo(() => {
    const needle = keyword.trim().toLowerCase();
    return items.filter((item) => {
      if (category !== "전체" && (item.category || "기타") !== category) return false;
      if (!needle) return true;
      return `${item.message} ${item.contact} ${item.category}`.toLowerCase().includes(needle);
    });
  }, [items, category, keyword]);

  const countByCategory = useMemo(() => {
    const counts = new Map<string, number>();
    items.forEach((item) => {
      const key = item.category || "기타";
      counts.set(key, (counts.get(key) ?? 0) + 1);
    });
    return counts;
  }, [items]);

  if (user?.role !== "ADMIN") return <Navigate to="/" replace />;

  return (
    <main className="min-h-[calc(100vh-64px)] bg-stone-100 text-stone-900">
      <section className="border-b border-stone-300 bg-white px-4 py-4 md:px-8">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <MessageSquare size={20} />
            <div>
              <h1 className="text-xl font-bold">사용자 피드백</h1>
              <p className="mt-1 text-sm text-stone-500">설정 화면에서 접수된 의견 (최신 200건)</p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => { void load(); }}
            disabled={status === "loading"}
            className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-md border border-stone-300 bg-white text-stone-700 hover:bg-stone-100 disabled:opacity-50"
            title="새로고침"
            aria-label="새로고침"
          >
            <RefreshCw size={18} className={status === "loading" ? "animate-spin" : ""} />
          </button>
        </div>
      </section>

      {/* 카테고리별 건수 */}
      <section className="mx-auto grid max-w-7xl grid-cols-2 gap-px bg-stone-300 sm:grid-cols-3 md:grid-cols-6">
        <div className="min-w-0 bg-white p-4">
          <div className="flex items-center gap-2 text-xs font-semibold text-stone-500"><Inbox size={16} />전체</div>
          <div className="mt-2 text-2xl font-bold">{items.length}</div>
        </div>
        {FEEDBACK_CATEGORIES.map((name) => (
          <div key={name} className="min-w-0 bg-white p-4">
            <div className="truncate text-xs font-semibold text-stone-500">{name}</div>
            <div className="mt-2 text-2xl font-bold">{countByCategory.get(name) ?? 0}</div>
          </div>
        ))}
      </section>

      <section className="mx-auto max-w-7xl px-4 py-5 md:px-8">
        {error && <div className="mb-4 border-l-4 border-red-600 bg-red-50 p-3 text-sm text-red-800">{error}</div>}

        <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-center">
          <label className="flex items-center gap-2 rounded-md border border-stone-300 bg-white px-3 py-2">
            <Filter size={16} className="text-stone-500" />
            <select
              value={category}
              onChange={(event) => setCategory(event.target.value)}
              className="min-w-28 bg-transparent text-sm outline-none"
              aria-label="분류 필터"
            >
              <option>전체</option>
              {FEEDBACK_CATEGORIES.map((name) => <option key={name}>{name}</option>)}
            </select>
          </label>
          <label className="flex flex-1 items-center gap-2 rounded-md border border-stone-300 bg-white px-3 py-2">
            <Search size={16} className="text-stone-500" />
            <input
              type="search"
              value={keyword}
              onChange={(event) => setKeyword(event.target.value)}
              placeholder="내용·연락처 검색"
              className="min-w-0 flex-1 bg-transparent text-sm outline-none"
            />
          </label>
        </div>

        {/* 데스크톱: 표 */}
        <div className="hidden overflow-x-auto border border-stone-300 bg-white md:block">
          <table className="w-full min-w-[900px] border-collapse text-left text-sm">
            <thead className="bg-stone-900 text-stone-100">
              <tr>
                {["접수 시각", "분류", "내용", "연락처", "상태", "사용자"].map((label) => (
                  <th key={label} className="px-3 py-3 font-semibold">{label}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.map((item) => (
                <tr key={item.id} className="border-t border-stone-200 align-top">
                  <td className="whitespace-nowrap px-3 py-3">{new Date(item.created_at).toLocaleString("ko-KR")}</td>
                  <td className="whitespace-nowrap px-3 py-3 font-semibold">{item.category || "기타"}</td>
                  <td className="max-w-lg whitespace-pre-wrap break-words px-3 py-3">{item.message}</td>
                  <td className="max-w-48 truncate px-3 py-3 text-stone-600">{item.contact || "-"}</td>
                  <td className="whitespace-nowrap px-3 py-3">{item.status}</td>
                  <td className="max-w-32 truncate px-3 py-3 text-xs text-stone-500">{item.user_id ?? "-"}</td>
                </tr>
              ))}
              {status !== "loading" && filtered.length === 0 && (
                <tr><td colSpan={6} className="px-3 py-10 text-center text-stone-500">표시할 피드백이 없습니다.</td></tr>
              )}
            </tbody>
          </table>
        </div>

        {/* 모바일: 카드 */}
        <ul className="flex flex-col gap-2 md:hidden">
          {filtered.map((item) => (
            <li key={item.id} className="rounded-lg border border-stone-300 bg-white p-3">
              <div className="flex flex-wrap items-center gap-2">
                <span className="rounded bg-stone-200 px-1.5 py-0.5 text-[11px] font-bold text-stone-700">{item.category || "기타"}</span>
                <span className="text-[11px] text-stone-500">{new Date(item.created_at).toLocaleString("ko-KR")}</span>
                <span className="ml-auto text-[11px] font-bold text-emerald-700">{item.status}</span>
              </div>
              <p className="mt-2 whitespace-pre-wrap break-words text-sm">{item.message}</p>
              {item.contact && <p className="mt-1 truncate text-xs text-stone-500">연락처: {item.contact}</p>}
            </li>
          ))}
          {status !== "loading" && filtered.length === 0 && (
            <li className="rounded-lg border border-stone-300 bg-white p-6 text-center text-sm text-stone-500">표시할 피드백이 없습니다.</li>
          )}
        </ul>

        {status === "loading" && <p className="mt-4 text-center text-sm text-stone-500">불러오는 중…</p>}
      </section>
    </main>
  );
};

export default AdminFeedbackRoute;
