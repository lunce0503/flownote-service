import { useMemo } from "react";
import type { DayOfWeek, ScheduleItem } from "@/entities/schedule";
import { buildWeeklyChart, formatDuration, getReadableTextColor } from "@/features/schedule";

interface WeeklyTimetableGridProps {
  items: ScheduleItem[];
  today: DayOfWeek;
  onSelectItem: (itemId: string) => void;
}

const HOUR_LABELS = [0, 3, 6, 9, 12, 15, 18, 21];
const DAY_COLUMN_HEIGHT = 576; // 시간당 24px × 24시간

const WeeklyTimetableGrid = ({ items, today, onSelectItem }: WeeklyTimetableGridProps) => {
  const weeklyChart = useMemo(() => buildWeeklyChart(items), [items]);

  return (
    <section className="rounded-2xl border border-stone-200 bg-stone-50 p-3">
      <div className="mb-3">
        <p className="text-xs font-bold uppercase text-amber-700">Weekly Timetable</p>
        <h3 className="text-lg font-black text-stone-950">주간 시간표</h3>
        <p className="text-sm text-stone-500">모든 요일의 루틴을 한눈에 봅니다. 항목을 누르면 아래 목록에서 확인할 수 있습니다.</p>
      </div>

      <div className="overflow-x-auto rounded-xl border border-stone-200 bg-white">
        <div className="grid min-w-[640px] grid-cols-[44px_repeat(7,minmax(0,1fr))]">
          <div className="sticky left-0 z-10 border-b border-stone-200 bg-white" />
          {weeklyChart.days.map((day) => (
            <div
              key={`head-${day.day}`}
              className={`border-b border-l border-stone-100 py-2 text-center text-xs font-black ${
                day.day === today ? "bg-amber-50 text-amber-800" : "text-stone-500"
              }`}
            >
              {day.label}
              {day.day === today ? <span className="ml-1 text-[10px]">오늘</span> : null}
            </div>
          ))}

          <div className="sticky left-0 z-10 bg-white" style={{ height: DAY_COLUMN_HEIGHT }}>
            {HOUR_LABELS.map((hour) => (
              <span
                key={hour}
                className="absolute pl-1 text-[10px] font-bold text-stone-400"
                style={{
                  top: `${(hour / 24) * 100}%`,
                  transform: hour === 0 ? "none" : "translateY(-50%)",
                }}
              >
                {hour}시
              </span>
            ))}
          </div>
          {weeklyChart.days.map((day) => (
            <div
              key={day.day}
              className={`relative border-l border-stone-100 ${day.day === today ? "bg-amber-50/40" : ""}`}
              style={{ height: DAY_COLUMN_HEIGHT }}
            >
              {Array.from({ length: 23 }, (_, index) => index + 1).map((hour) => (
                <div
                  key={hour}
                  className={`pointer-events-none absolute left-0 right-0 border-t ${hour % 6 === 0 ? "border-stone-200" : "border-stone-100"}`}
                  style={{ top: `${(hour / 24) * 100}%` }}
                />
              ))}
              {day.segments.map((segment) => {
                const laneWidth = 100 / day.laneCount;
                const showLabel = segment.endMin - segment.startMin >= 30;
                return (
                  <button
                    key={segment.key}
                    type="button"
                    onClick={() => onSelectItem(segment.itemId)}
                    className={`absolute overflow-hidden rounded-md px-1 py-0.5 text-left text-[10px] font-bold shadow-sm transition hover:brightness-110 ${
                      segment.isSpill ? "opacity-70" : ""
                    }`}
                    style={{
                      top: `${segment.top}%`,
                      height: `${segment.height}%`,
                      left: `${segment.lane * laneWidth}%`,
                      width: `${laneWidth}%`,
                      backgroundColor: segment.color,
                      color: getReadableTextColor(segment.color),
                    }}
                    title={`${segment.title} ${segment.range} (${formatDuration(segment.durationMinutes)})${segment.isSpill ? " · 전날에서 이어짐" : ""}`}
                    aria-label={`${segment.title} ${segment.range}`}
                  >
                    {showLabel ? <span className="line-clamp-2">{segment.title}</span> : null}
                  </button>
                );
              })}
            </div>
          ))}
        </div>
      </div>
    </section>
  );
};

export default WeeklyTimetableGrid;
