import { useState } from "react";
import {
  ChevronLeft, ChevronRight, CalendarDays, Loader2, Check, AlertCircle, Undo2, Trash2,
} from "lucide-react";
import { usePlanner, toDateKey, dayOfWeekOf } from "@/features/planner";
import PlannerTodoPanel from "./PlannerTodoPanel";
import PlannerTimetableCanvas from "./PlannerTimetableCanvas";
import PlannerJournal from "./PlannerJournal";
import PlannerWeeklyBoard from "./PlannerWeeklyBoard";
import PlannerMonthlyCalendar from "./PlannerMonthlyCalendar";

const WEEKDAY_LABELS = ["일", "월", "화", "수", "목", "금", "토"];

const formatDateLabel = (dateKey: string) => {
  const [y, m, d] = dateKey.split("-").map(Number);
  const date = new Date(y, (m ?? 1) - 1, d ?? 1);
  return `${y}년 ${m}월 ${d}일 (${WEEKDAY_LABELS[date.getDay()]})`;
};

const SaveIndicator = ({ status }: { status: "idle" | "saving" | "saved" | "error" }) => {
  if (status === "saving") return <span className="flex items-center gap-1 text-xs text-neutral-500"><Loader2 size={13} className="animate-spin" /> 저장 중…</span>;
  if (status === "saved") return <span className="flex items-center gap-1 text-xs text-neutral-700"><Check size={13} /> 저장됨</span>;
  if (status === "error") return <span className="flex items-center gap-1 text-xs text-red-600"><AlertCircle size={13} /> 저장 실패</span>;
  return null;
};

/**
 * 플래너: 할 일 · 시간표 · 일기를 한 화면에서 다룬다.
 * - 일간: 할일(+작업 요약) / 시간표 캔버스(반복 일정은 투명, 오늘 필기는 그림판) / 저널
 * - 주간: 반복 일정을 임의로 지정
 * - 월간: 캘린더 + .ics 내보내기(모바일 캘린더 연동 대비)
 * 디자인은 항상 흰 배경 + 검은 글씨.
 */
const PlannerWidget = () => {
  const planner = usePlanner();
  const { diary } = planner;
  const [penColor, setPenColor] = useState("#111111");
  const isToday = diary.date === toDateKey(new Date());
  const today = dayOfWeekOf(new Date());

  const views = [
    { id: "day" as const, label: "일간" },
    { id: "week" as const, label: "주간" },
    { id: "month" as const, label: "월간" },
  ];

  return (
    <main className="min-h-full w-full bg-white px-3 py-4 text-black sm:px-6">
      <div className="mx-auto flex max-w-5xl flex-col gap-4">
        <header className="flex flex-col gap-3 rounded-2xl border border-neutral-200 bg-white p-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-black text-white">
                <CalendarDays size={20} />
              </div>
              <div>
                <h1 className="text-lg font-bold">플래너</h1>
                <p className="text-sm text-neutral-600">
                  {formatDateLabel(diary.date)}
                  {isToday && <span className="ml-1 rounded bg-black px-1.5 py-0.5 text-[10px] font-bold text-white">오늘</span>}
                </p>
              </div>
            </div>
            <SaveIndicator status={diary.saveStatus} />
          </div>

          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-1 rounded-lg bg-neutral-100 p-0.5">
              {views.map((view) => (
                <button
                  key={view.id}
                  type="button"
                  onClick={() => planner.setView(view.id)}
                  className={`rounded-md px-3 py-1.5 text-xs font-semibold transition ${
                    planner.view === view.id ? "bg-black text-white" : "text-neutral-600 hover:bg-neutral-200"
                  }`}
                  aria-pressed={planner.view === view.id}
                >
                  {view.label}
                </button>
              ))}
            </div>

            <div className="flex items-center gap-1">
              <button type="button" onClick={() => diary.goToDate(-1)} className="flex h-9 w-9 items-center justify-center rounded-lg border border-neutral-200 hover:bg-neutral-50" title="이전 날">
                <ChevronLeft size={18} />
              </button>
              <input
                type="date"
                value={diary.date}
                onChange={(event) => { if (event.target.value) diary.setDate(event.target.value); }}
                className="rounded-lg border border-neutral-200 bg-white px-2 py-1.5 text-sm text-black outline-none focus:border-black"
              />
              <button type="button" onClick={() => diary.goToDate(1)} className="flex h-9 w-9 items-center justify-center rounded-lg border border-neutral-200 hover:bg-neutral-50" title="다음 날">
                <ChevronRight size={18} />
              </button>
              <button type="button" onClick={diary.goToday} className="rounded-lg border border-neutral-200 px-3 py-1.5 text-sm font-semibold hover:bg-neutral-50">
                오늘
              </button>
            </div>
          </div>
        </header>

        {diary.loadStatus === "loading" && (
          <div className="flex items-center justify-center gap-2 rounded-2xl border border-neutral-200 bg-white py-16 text-neutral-500">
            <Loader2 size={18} className="animate-spin" /> 불러오는 중…
          </div>
        )}

        {diary.loadStatus === "error" && (
          <div className="flex flex-col items-center justify-center gap-3 rounded-2xl border border-neutral-200 bg-white py-16 text-neutral-700">
            <AlertCircle size={22} className="text-red-600" />
            <p className="text-sm">플래너를 불러오지 못했습니다.</p>
            <button type="button" onClick={diary.reload} className="rounded-lg bg-black px-4 py-2 text-sm font-semibold text-white hover:bg-neutral-700">
              다시 시도
            </button>
          </div>
        )}

        {diary.loadStatus === "ready" && planner.view === "day" && (
          <>
            <div className="grid grid-cols-1 items-start gap-4 lg:grid-cols-[320px_1fr]">
              <PlannerTodoPanel
                todos={diary.todos}
                tasks={planner.tasks}
                activeTodoId={diary.activeTodoId}
                tool={diary.tool}
                penColor={penColor}
                date={diary.date}
                onSelect={diary.setActiveTodoId}
                onAdd={(label, color) => diary.addTodo(label, color)}
                onUpdate={diary.updateTodo}
                onToggleDone={diary.toggleTodoDone}
                onDelete={diary.deleteTodo}
                onToolChange={diary.setTool}
                onPenColorChange={setPenColor}
                onToggleTask={planner.toggleTaskDone}
                onDeleteTask={planner.removeTask}
                onPromoteTodo={planner.promoteTodoToTask}
              />

              <section className="flex flex-col gap-2 rounded-xl border border-neutral-200 bg-white p-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <h3 className="text-sm font-bold">오늘의 시간표</h3>
                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      onClick={diary.undoStroke}
                      disabled={diary.grid.strokes.length === 0}
                      className="flex items-center gap-1 rounded-md border border-neutral-200 px-2 py-1 text-xs font-semibold text-neutral-700 transition hover:bg-neutral-50 disabled:opacity-40"
                      title="마지막 필기 되돌리기"
                    >
                      <Undo2 size={13} /> 되돌리기
                    </button>
                    <button
                      type="button"
                      onClick={diary.clearStrokes}
                      disabled={diary.grid.strokes.length === 0}
                      className="flex items-center gap-1 rounded-md border border-neutral-200 px-2 py-1 text-xs font-semibold text-neutral-700 transition hover:bg-neutral-50 disabled:opacity-40"
                      title="필기 전체 지우기"
                    >
                      <Trash2 size={13} /> 필기 지움
                    </button>
                  </div>
                </div>
                <p className="text-xs text-neutral-500">
                  주간 일정은 투명하게 겹쳐 보이고, 오늘 칠한 칸과 펜 필기가 그 위에 저장됩니다.
                </p>
                <PlannerTimetableCanvas
                  grid={diary.grid}
                  todos={diary.todos}
                  scheduleItems={planner.scheduleForSelectedDay}
                  tool={diary.tool}
                  activeTodoId={diary.activeTodoId}
                  penColor={penColor}
                  onPaintCell={diary.paintCell}
                  onAddStroke={diary.addStroke}
                />
              </section>
            </div>

            <section className="flex flex-col gap-2 rounded-xl border border-neutral-200 bg-white p-3">
              <h3 className="text-sm font-bold">오늘 있었던 일</h3>
              <PlannerJournal
                key={diary.date}
                initialContent={diary.journal}
                onChange={diary.setJournalBlocks}
              />
            </section>
          </>
        )}

        {diary.loadStatus === "ready" && planner.view === "week" && (
          <PlannerWeeklyBoard
            items={planner.scheduleItems}
            today={today}
            onSave={planner.saveScheduleItem}
            onDelete={planner.removeScheduleItem}
          />
        )}

        {diary.loadStatus === "ready" && planner.view === "month" && (
          <PlannerMonthlyCalendar
            selectedDate={diary.date}
            scheduleItems={planner.scheduleItems}
            tasks={planner.tasks}
            diaryDates={planner.diaryDates}
            onSelectDate={(date) => { diary.setDate(date); planner.setView("day"); }}
          />
        )}
      </div>
    </main>
  );
};

export default PlannerWidget;
