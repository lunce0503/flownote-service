import { useMemo, useState } from "react";
import { ChevronLeft, ChevronRight, CalendarDays, Download } from "lucide-react";
import type { ScheduleItem } from "@/entities/schedule";
import {
  type PlannerTaskSummary,
  dateKey,
  monthMatrix,
  scheduleItemsOnDate,
  scheduleItemToEvent,
  taskToEvent,
  eventsToIcs,
  type PlannerCalendarEvent,
} from "@/features/planner";

type Props = {
  selectedDate: string;
  scheduleItems: ScheduleItem[];
  tasks: PlannerTaskSummary[];
  diaryDates: string[];
  onSelectDate: (date: string) => void;
};

const WEEKDAYS = ["일", "월", "화", "수", "목", "금", "토"];

const PlannerMonthlyCalendar = ({ selectedDate, scheduleItems, tasks, diaryDates, onSelectDate }: Props) => {
  const [cursor, setCursor] = useState(() => {
    const [y, m] = selectedDate.split("-").map(Number);
    return { year: y, month: (m ?? 1) - 1 };
  });

  const cells = useMemo(() => monthMatrix(cursor.year, cursor.month), [cursor]);
  const diarySet = useMemo(() => new Set(diaryDates), [diaryDates]);
  const tasksByDate = useMemo(() => {
    const map = new Map<string, PlannerTaskSummary[]>();
    tasks.forEach((task) => {
      if (!task.dueDate) return;
      map.set(task.dueDate, [...(map.get(task.dueDate) ?? []), task]);
    });
    return map;
  }, [tasks]);

  const todayKey = dateKey(new Date());

  const shiftMonth = (delta: number) => {
    setCursor((current) => {
      const next = new Date(current.year, current.month + delta, 1);
      return { year: next.getFullYear(), month: next.getMonth() };
    });
  };

  // 이번 달 범위의 이벤트를 표준 캘린더 형식으로 만들어 .ics로 내보낸다.
  // iOS/안드로이드 기본 캘린더가 그대로 가져올 수 있고, 추후 네이티브 동기화도 같은 모델을 쓴다.
  const exportIcs = () => {
    const events: PlannerCalendarEvent[] = [];
    const seenSchedule = new Set<string>();
    cells.forEach((date) => {
      if (date.getMonth() !== cursor.month) return;
      scheduleItemsOnDate(scheduleItems, date).forEach((item) => {
        // 반복 일정은 RRULE로 한 번만 내보낸다(첫 발생일 기준).
        if (seenSchedule.has(item.id)) return;
        seenSchedule.add(item.id);
        events.push(scheduleItemToEvent(item, date));
      });
    });
    tasks.forEach((task) => {
      if (!task.dueDate) return;
      const [y, m] = task.dueDate.split("-").map(Number);
      if (y !== cursor.year || (m ?? 1) - 1 !== cursor.month) return;
      const event = taskToEvent({ id: task.id, task_name: task.name, due_date: task.dueDate } as never);
      if (event) events.push(event);
    });

    const ics = eventsToIcs(events, `Flownote ${cursor.year}-${String(cursor.month + 1).padStart(2, "0")}`);
    const blob = new Blob([ics], { type: "text/calendar;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `flownote-${cursor.year}-${String(cursor.month + 1).padStart(2, "0")}.ics`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  return (
    <section className="flex flex-col gap-3 rounded-xl border border-neutral-200 bg-white p-3 text-black">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <CalendarDays size={18} />
          <h3 className="text-sm font-bold">{cursor.year}년 {cursor.month + 1}월</h3>
        </div>
        <div className="flex items-center gap-1">
          <button type="button" onClick={() => shiftMonth(-1)} className="flex h-8 w-8 items-center justify-center rounded-lg border border-neutral-200 hover:bg-neutral-50" title="이전 달">
            <ChevronLeft size={16} />
          </button>
          <button type="button" onClick={() => shiftMonth(1)} className="flex h-8 w-8 items-center justify-center rounded-lg border border-neutral-200 hover:bg-neutral-50" title="다음 달">
            <ChevronRight size={16} />
          </button>
          <button
            type="button"
            onClick={exportIcs}
            className="flex items-center gap-1 rounded-lg border border-neutral-200 px-2 py-1.5 text-xs font-semibold hover:bg-neutral-50"
            title="이 달의 일정을 .ics로 내보내 휴대폰 캘린더에 추가"
          >
            <Download size={14} /> 캘린더 내보내기
          </button>
        </div>
      </div>

      <div className="grid grid-cols-7 gap-px overflow-hidden rounded-lg border border-neutral-200 bg-neutral-200">
        {WEEKDAYS.map((day) => (
          <div key={day} className="bg-white py-1.5 text-center text-[11px] font-bold text-neutral-500">{day}</div>
        ))}
        {cells.map((date) => {
          const key = dateKey(date);
          const inMonth = date.getMonth() === cursor.month;
          const daySchedules = scheduleItemsOnDate(scheduleItems, date);
          const dayTasks = tasksByDate.get(key) ?? [];
          const hasDiary = diarySet.has(key);
          const isSelected = key === selectedDate;
          return (
            <button
              key={key}
              type="button"
              onClick={() => onSelectDate(key)}
              className={`flex min-h-16 flex-col items-start gap-1 bg-white p-1.5 text-left transition hover:bg-neutral-50 sm:min-h-24 ${
                inMonth ? "" : "opacity-40"
              } ${isSelected ? "ring-2 ring-inset ring-black" : ""}`}
            >
              <span className={`text-[11px] font-bold ${key === todayKey ? "rounded bg-black px-1.5 py-0.5 text-white" : "text-black"}`}>
                {date.getDate()}
              </span>
              <span className="flex flex-wrap gap-0.5">
                {daySchedules.slice(0, 4).map((item) => (
                  <span
                    key={item.id}
                    className="h-1.5 w-1.5 rounded-full"
                    style={{ backgroundColor: item.color || "#111111" }}
                    title={item.title}
                  />
                ))}
                {hasDiary && <span className="h-1.5 w-1.5 rounded-full bg-black" title="일기 작성됨" />}
              </span>
              {dayTasks.length > 0 && (
                <span className="hidden w-full truncate text-[10px] text-neutral-600 sm:block">
                  {dayTasks[0].name}{dayTasks.length > 1 ? ` 외 ${dayTasks.length - 1}` : ""}
                </span>
              )}
            </button>
          );
        })}
      </div>

      <p className="text-[11px] text-neutral-500">
        점은 반복 일정, 검은 점은 일기가 있는 날입니다. 날짜를 누르면 그날의 일간 보기로 이동합니다.
      </p>
    </section>
  );
};

export default PlannerMonthlyCalendar;
