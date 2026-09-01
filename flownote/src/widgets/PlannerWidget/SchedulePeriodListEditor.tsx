import { Plus, Trash2 } from "lucide-react";
import type { DayOfWeek } from "@/entities/schedule";
import {
  DAY_OPTIONS,
  createSchedulePeriod,
  type SchedulePeriodInput,
} from "@/features/schedule";

type Props = {
  periods: SchedulePeriodInput[];
  onChange: (periods: SchedulePeriodInput[]) => void;
};

const addMinutes = (time: string, minutesToAdd: number) => {
  const [hours = 0, minutes = 0] = time.split(":").map(Number);
  const nextMinutes = Math.min(hours * 60 + minutes + minutesToAdd, 23 * 60 + 59);
  return `${String(Math.floor(nextMinutes / 60)).padStart(2, "0")}:${String(nextMinutes % 60).padStart(2, "0")}`;
};

const SchedulePeriodListEditor = ({ periods, onChange }: Props) => {
  const updatePeriod = (id: string, patch: Partial<Omit<SchedulePeriodInput, "id">>) => {
    onChange(periods.map((period) => (period.id === id ? { ...period, ...patch } : period)));
  };

  const toggleDay = (period: SchedulePeriodInput, day: DayOfWeek) => {
    const daysOfWeek = period.daysOfWeek.includes(day)
      ? period.daysOfWeek.filter((value) => value !== day)
      : [...period.daysOfWeek, day];
    updatePeriod(period.id, { daysOfWeek });
  };

  const addPeriod = () => {
    const previous = periods.at(-1);
    const startTime = previous?.endTime && previous.endTime < "23:59" ? previous.endTime : "09:00";
    onChange([
      ...periods,
      createSchedulePeriod({ startTime, endTime: addMinutes(startTime, 60) }),
    ]);
  };

  const removePeriod = (id: string) => {
    if (periods.length <= 1) return;
    onChange(periods.filter((period) => period.id !== id));
  };

  return (
    <section aria-labelledby="schedule-period-list-title" className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h4 id="schedule-period-list-title" className="text-xs font-bold text-black">기간 리스트</h4>
          <p className="text-[11px] text-neutral-500">기간마다 반복 요일과 시간 구간을 지정합니다.</p>
        </div>
        <button
          type="button"
          onClick={addPeriod}
          className="flex min-h-9 items-center gap-1 rounded-md border border-neutral-300 bg-white px-3 text-xs font-semibold text-neutral-700 transition hover:border-black hover:text-black"
        >
          <Plus size={14} /> 기간 추가
        </button>
      </div>

      <div className="divide-y divide-neutral-200 border-y border-neutral-200">
        {periods.map((period, index) => (
          <div
            key={period.id}
            role="group"
            aria-labelledby={`schedule-period-${period.id}`}
            className="flex min-w-0 flex-col gap-3 py-3"
          >
            <div className="flex items-center justify-between gap-2">
              <span id={`schedule-period-${period.id}`} className="text-xs font-bold text-neutral-600">기간 {index + 1}</span>
              <button
                type="button"
                onClick={() => removePeriod(period.id)}
                disabled={periods.length <= 1}
                className="flex h-8 w-8 items-center justify-center rounded-md text-neutral-400 transition hover:bg-red-50 hover:text-red-600 disabled:cursor-not-allowed disabled:opacity-30"
                aria-label={`기간 ${index + 1} 삭제`}
                title="기간 삭제"
              >
                <Trash2 size={15} />
              </button>
            </div>

            <div className="flex flex-wrap gap-1" aria-label={`기간 ${index + 1} 반복 요일`}>
              {DAY_OPTIONS.map((day) => {
                const selected = period.daysOfWeek.includes(day.value);
                return (
                  <button
                    key={day.value}
                    type="button"
                    onClick={() => toggleDay(period, day.value)}
                    aria-pressed={selected}
                    className={`h-8 w-8 rounded-md border text-xs font-bold transition ${
                      selected
                        ? "border-black bg-black text-white"
                        : "border-neutral-200 bg-white text-neutral-600 hover:border-neutral-400"
                    }`}
                  >
                    {day.label}
                  </button>
                );
              })}
            </div>

            <div className="grid grid-cols-2 gap-2 sm:max-w-sm">
              <label className="min-w-0">
                <span className="mb-1 block text-[11px] font-medium text-neutral-500">시작</span>
                <input
                  type="time"
                  value={period.startTime}
                  onChange={(event) => updatePeriod(period.id, { startTime: event.target.value })}
                  className="w-full min-w-0 rounded-md border border-neutral-200 bg-white px-2 py-1.5 text-sm text-black outline-none focus:border-black"
                />
              </label>
              <label className="min-w-0">
                <span className="mb-1 block text-[11px] font-medium text-neutral-500">종료</span>
                <input
                  type="time"
                  value={period.endTime}
                  onChange={(event) => updatePeriod(period.id, { endTime: event.target.value })}
                  className="w-full min-w-0 rounded-md border border-neutral-200 bg-white px-2 py-1.5 text-sm text-black outline-none focus:border-black"
                />
              </label>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
};

export default SchedulePeriodListEditor;
