import { ChevronLeft, ChevronRight, CalendarDays, Loader2, Check, AlertCircle } from "lucide-react";
import { useDiary, toDateKey } from "@/features/diary";
import DiaryTodoPanel from "./DiaryTodoPanel";
import DiaryTimetableCanvas from "./DiaryTimetableCanvas";
import DiaryJournal from "./DiaryJournal";

const WEEKDAYS = ["일", "월", "화", "수", "목", "금", "토"];

const formatDateLabel = (dateKey: string) => {
  const [y, m, d] = dateKey.split("-").map(Number);
  const date = new Date(y, (m ?? 1) - 1, d ?? 1);
  return `${y}년 ${m}월 ${d}일 (${WEEKDAYS[date.getDay()]})`;
};

const SaveIndicator = ({ status }: { status: ReturnType<typeof useDiary>["saveStatus"] }) => {
  if (status === "saving") return <span className="flex items-center gap-1 text-xs text-slate-400"><Loader2 size={13} className="animate-spin" /> 저장 중…</span>;
  if (status === "saved") return <span className="flex items-center gap-1 text-xs text-green-600"><Check size={13} /> 저장됨</span>;
  if (status === "error") return <span className="flex items-center gap-1 text-xs text-red-500"><AlertCircle size={13} /> 저장 실패</span>;
  return null;
};

const DiaryWidget = () => {
  const diary = useDiary();
  const isToday = diary.date === toDateKey(new Date());

  return (
    <main className="min-h-full w-full bg-[#242424] px-3 py-4 sm:px-6">
      <div className="mx-auto flex max-w-5xl flex-col gap-4">
        {/* 헤더: 날짜 네비게이션 + 저장 상태 */}
        <header className="flex flex-col gap-3 rounded-2xl bg-white p-4 shadow-sm sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-slate-900 text-white">
              <CalendarDays size={20} />
            </div>
            <div>
              <h1 className="text-lg font-bold text-slate-900">일기장</h1>
              <p className="text-sm text-slate-500">{formatDateLabel(diary.date)}{isToday && <span className="ml-1 rounded bg-slate-900 px-1.5 py-0.5 text-[10px] font-bold text-white">오늘</span>}</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <SaveIndicator status={diary.saveStatus} />
            <div className="flex items-center gap-1">
              <button type="button" onClick={() => diary.goToDate(-1)} className="flex h-9 w-9 items-center justify-center rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50" title="이전 날">
                <ChevronLeft size={18} />
              </button>
              <input
                type="date"
                value={diary.date}
                onChange={(event) => { if (event.target.value) diary.setDate(event.target.value); }}
                className="rounded-lg border border-slate-200 px-2 py-1.5 text-sm text-slate-700 outline-none focus:border-slate-900"
              />
              <button type="button" onClick={() => diary.goToDate(1)} className="flex h-9 w-9 items-center justify-center rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50" title="다음 날">
                <ChevronRight size={18} />
              </button>
              <button type="button" onClick={diary.goToday} className="rounded-lg border border-slate-200 px-3 py-1.5 text-sm font-semibold text-slate-700 hover:bg-slate-50">오늘</button>
            </div>
          </div>
        </header>

        {diary.loadStatus === "loading" && (
          <div className="flex items-center justify-center gap-2 rounded-2xl bg-white/90 py-16 text-slate-400">
            <Loader2 size={18} className="animate-spin" /> 불러오는 중…
          </div>
        )}

        {diary.loadStatus === "error" && (
          <div className="flex flex-col items-center justify-center gap-3 rounded-2xl bg-white/90 py-16 text-slate-500">
            <AlertCircle size={22} className="text-red-500" />
            <p className="text-sm">일기를 불러오지 못했습니다.</p>
            <button type="button" onClick={diary.reload} className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-700">다시 시도</button>
          </div>
        )}

        {diary.loadStatus === "ready" && (
          <>
            <div className="grid grid-cols-1 items-start gap-4 lg:grid-cols-[320px_1fr]">
              <DiaryTodoPanel
                todos={diary.todos}
                activeTodoId={diary.activeTodoId}
                tool={diary.tool}
                onSelect={diary.setActiveTodoId}
                onAdd={(label, color) => diary.addTodo(label, color)}
                onUpdate={diary.updateTodo}
                onToggleDone={diary.toggleTodoDone}
                onDelete={diary.deleteTodo}
                onToolChange={diary.setTool}
              />
              <section className="flex flex-col gap-2 rounded-xl border border-slate-200 bg-white p-3">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-bold text-slate-800">오늘의 시간표</h3>
                  <p className="text-xs text-slate-400">할일 색을 골라 칸을 칠하세요</p>
                </div>
                <DiaryTimetableCanvas
                  grid={diary.grid}
                  todos={diary.todos}
                  tool={diary.tool}
                  activeTodoId={diary.activeTodoId}
                  onPaintCell={diary.paintCell}
                />
              </section>
            </div>

            <section className="flex flex-col gap-2 rounded-xl border border-slate-200 bg-white p-3">
              <h3 className="text-sm font-bold text-slate-800">오늘 있었던 일</h3>
              <DiaryJournal
                key={diary.date}
                initialContent={diary.journal}
                onChange={diary.setJournalBlocks}
              />
            </section>
          </>
        )}
      </div>
    </main>
  );
};

export default DiaryWidget;
