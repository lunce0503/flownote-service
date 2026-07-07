import { useEffect, useMemo, useState } from "react";
import { CalendarClock, Clock3, Plus, Save, Trash2, X } from "lucide-react";
import {
  createScheduleItem,
  deleteScheduleItem,
  listScheduleItems,
  updateScheduleItem,
} from "@/entities/schedule";
import type { DayOfWeek, ScheduleItem, ScheduleItemInput } from "@/entities/schedule";
import {
  DAY_OPTIONS,
  EMPTY_SCHEDULE_FORM,
  buildRoutineChart,
  createDraftId,
  formatDateLabel,
  formatDays,
  formatDuration,
  getDayLabel,
  getDayTotals,
  getItemDuration,
  getScheduleItemsByDay,
  getToday,
  sortScheduleItems,
  toScheduleInput,
  toScheduleItem,
  validateScheduleInput,
} from "@/features/schedule";

const DailySchedulePanel = () => {
  const [items, setItems] = useState<ScheduleItem[]>([]);
  const [form, setForm] = useState<ScheduleItemInput>(EMPTY_SCHEDULE_FORM);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const today = getToday();
  const [selectedDay, setSelectedDay] = useState<DayOfWeek>(today);
  const selectedDayLabel = getDayLabel(selectedDay);
  const sortedItems = useMemo(
    () => sortScheduleItems(items),
    [items],
  );
  const selectedDayItems = useMemo(
    () => getScheduleItemsByDay(sortedItems, selectedDay),
    [sortedItems, selectedDay],
  );
  const dayTotals = useMemo(() => getDayTotals(items), [items]);
  const routineChart = useMemo(() => buildRoutineChart(selectedDayItems), [selectedDayItems]);

  const fetchItems = async () => {
    setIsLoading(true);
    setError(null);
    try {
      const scheduleItems = await listScheduleItems();
      setItems(Array.isArray(scheduleItems) ? scheduleItems : []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "시간표를 불러오지 못했습니다.");
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    void fetchItems();
  }, []);

  const toggleDay = (day: DayOfWeek) => {
    setForm((prev) => {
      const exists = prev.daysOfWeek.includes(day);
      const daysOfWeek = exists
        ? prev.daysOfWeek.filter((item) => item !== day)
        : [...prev.daysOfWeek, day];
      return { ...prev, daysOfWeek };
    });
  };

  const resetForm = () => {
    if (editingId?.startsWith("draft-")) {
      setItems((prev) => prev.filter((item) => item.id !== editingId));
    }
    setForm(EMPTY_SCHEDULE_FORM);
    setEditingId(null);
    setError(null);
  };

  const validate = () => {
    return validateScheduleInput(form);
  };

  const handleSubmit = async () => {
    const message = validate();
    if (message) {
      setError(message);
      return;
    }

    setError(null);
    try {
      if (editingId) {
        if (editingId.startsWith("draft-")) {
          const created = await createScheduleItem(form);
          setItems((prev) => prev.map((item) => (item.id === editingId ? created : item)));
        } else {
          const updated = await updateScheduleItem(editingId, form);
          if (updated) {
            setItems((prev) => prev.map((item) => (item.id === editingId ? updated : item)));
          }
        }
      } else {
        const created = await createScheduleItem(form);
        setItems((prev) => [...prev, created]);
      }
      resetForm();
    } catch (err) {
      setError(err instanceof Error ? err.message : "시간표를 저장하지 못했습니다.");
    }
  };

  const startEdit = (item: ScheduleItem) => {
    setEditingId(item.id);
    setForm(toScheduleInput(item));
    setError(null);
  };

  const addDraftSchedule = () => {
    if (editingId?.startsWith("draft-")) return;
    const id = createDraftId();
    const input = {
      ...EMPTY_SCHEDULE_FORM,
      title: "새 시간표",
      daysOfWeek: [today],
    };
    setItems((prev) => [toScheduleItem(id, input), ...prev]);
    setEditingId(id);
    setForm(input);
    setError(null);
  };

  const handleDelete = async (id: string) => {
    setItems((prev) => prev.filter((item) => item.id !== id));
    try {
      await deleteScheduleItem(id);
    } catch (err) {
      setError(err instanceof Error ? err.message : "시간표를 삭제하지 못했습니다.");
      void fetchItems();
    }
  };

  return (
    <section className="mb-4 rounded-2xl border border-stone-200 bg-white p-4 shadow-sm">
      <div className="mb-4 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div>
          <div className="flex items-center gap-2 text-xs font-bold uppercase text-amber-700">
            <CalendarClock size={16} />
            Daily Routine
          </div>
          <h2 className="mt-1 text-xl font-black text-stone-950">오늘 시간표</h2>
          <p className="text-sm text-stone-500">{formatDateLabel()} 반복 일정</p>
        </div>
        <button
          type="button"
          onClick={addDraftSchedule}
          className="inline-flex items-center justify-center gap-2 rounded-xl bg-stone-900 px-4 py-2 text-sm font-bold text-white hover:bg-stone-700"
        >
          <Plus size={18} />
          시간표 추가
        </button>
      </div>

      {error ? <div className="mb-3 rounded-xl bg-red-50 px-4 py-3 text-sm font-semibold text-red-700">{error}</div> : null}

      <div className="mb-4 grid gap-2 sm:grid-cols-4 lg:grid-cols-7">
        {dayTotals.map((day) => (
          <button
            key={day.value}
            type="button"
            onClick={() => setSelectedDay(day.value)}
            aria-pressed={selectedDay === day.value}
            className={`rounded-xl border px-3 py-2 text-left transition hover:border-amber-300 hover:bg-amber-50 ${
              selectedDay === day.value
                ? "border-amber-400 bg-amber-50 shadow-sm"
                : day.value === today
                  ? "border-amber-200 bg-white"
                  : "border-stone-200 bg-stone-50"
            }`}
          >
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs font-black text-stone-500">{day.label}</span>
              {day.value === today ? <span className="text-[10px] font-black text-amber-700">오늘</span> : null}
            </div>
            <div className="mt-1 text-sm font-black text-stone-900">{formatDuration(day.minutes)}</div>
          </button>
        ))}
      </div>

      {isLoading ? (
        <div className="rounded-xl border border-dashed border-stone-200 py-10 text-center text-sm font-semibold text-stone-400">
          시간표를 불러오는 중...
        </div>
      ) : (
        <div className="space-y-4">
          {selectedDayItems.length === 0 ? (
            <div className="rounded-xl border border-dashed border-stone-200 py-8 text-center text-sm font-semibold text-stone-400">
              {selectedDayLabel}요일에 배정된 반복 시간표가 없습니다. 위 요일을 눌러 다른 요일 일정을 확인할 수 있습니다.
            </div>
          ) : (
            <section className="rounded-2xl border border-stone-200 bg-stone-50 p-3">
              <div className="mb-3 flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
                <div>
                  <p className="text-xs font-bold uppercase text-amber-700">Today Allocation</p>
                  <h3 className="text-lg font-black text-stone-950">{selectedDayLabel}요일 시간 분배</h3>
                  <p className="text-sm text-stone-500">선택한 요일에 저장된 루틴을 24시간 기준으로 배치합니다.</p>
                </div>
                <div className="text-sm font-black text-stone-700">
                  루틴 {formatDuration(routineChart.totalMinutes)} / 여유 {formatDuration(routineChart.freeMinutes)}
                </div>
              </div>

              <div className="rounded-xl border border-stone-200 bg-white p-3">
                <div className="relative h-16 rounded-lg bg-stone-100">
                  {[0, 6, 12, 18, 24].map((hour) => (
                    <div
                      key={hour}
                      className="absolute top-0 h-full border-l border-stone-300/70"
                      style={{ left: `${(hour / 24) * 100}%` }}
                    />
                  ))}
                  {routineChart.segments.map((segment) => (
                    <div
                      key={segment.id}
                      className="absolute top-2 flex h-12 min-w-2 items-center overflow-hidden rounded-md px-2 text-[11px] font-black text-white shadow-sm"
                      style={{
                        left: `${segment.left}%`,
                        width: `${segment.width}%`,
                        backgroundColor: segment.color,
                      }}
                      title={`${segment.title} ${segment.range} (${formatDuration(segment.duration)})`}
                    >
                      <span className="truncate">{segment.title}</span>
                    </div>
                  ))}
                </div>
                <div className="grid grid-cols-5 text-center text-[11px] font-bold text-stone-500">
                  <span className="py-1">0h</span>
                  <span className="py-1">6h</span>
                  <span className="py-1">12h</span>
                  <span className="py-1">18h</span>
                  <span className="py-1">24h</span>
                </div>
              </div>

              <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                {routineChart.totals.map((total) => (
                  <div key={total.label} className="flex items-center gap-2 rounded-lg bg-white px-3 py-2 text-sm">
                    <span className="h-3 w-3 rounded-full" style={{ backgroundColor: total.color }} />
                    <span className="min-w-0 flex-1 truncate font-semibold">{total.label}</span>
                    <span className="text-xs font-bold text-stone-500">{formatDuration(total.minutes)}</span>
                  </div>
                ))}
              </div>
            </section>
          )}

          <section>
            <h3 className="mb-2 text-lg font-black text-stone-950">시간표 목록</h3>
            <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-3">
              {sortedItems.map((item) => {
                const isEditing = editingId === item.id;
                const isToday = item.is_active && item.days_of_week.includes(today);
                const duration = getItemDuration(item);

                return (
                  <article key={item.id} className="rounded-xl border border-stone-200 bg-stone-50 p-3">
                    {isEditing ? (
                      <div className="space-y-3">
                        <div className="grid gap-3 md:grid-cols-[minmax(180px,1fr)_120px_120px]">
            <label className="space-y-1">
              <span className="text-xs font-bold text-stone-500">제목</span>
              <input
                value={form.title}
                onChange={(event) => setForm((prev) => ({ ...prev, title: event.target.value }))}
                className="w-full rounded-xl border border-stone-200 bg-white px-3 py-2 text-sm outline-none focus:border-amber-500"
                placeholder="예: 수능 국어 독서"
              />
            </label>
            <label className="space-y-1">
              <span className="text-xs font-bold text-stone-500">시작</span>
              <input
                type="time"
                value={form.startTime}
                onChange={(event) => setForm((prev) => ({ ...prev, startTime: event.target.value }))}
                className="w-full rounded-xl border border-stone-200 bg-white px-3 py-2 text-sm outline-none focus:border-amber-500"
              />
            </label>
            <label className="space-y-1">
              <span className="text-xs font-bold text-stone-500">종료</span>
              <input
                type="time"
                value={form.endTime}
                onChange={(event) => setForm((prev) => ({ ...prev, endTime: event.target.value }))}
                className="w-full rounded-xl border border-stone-200 bg-white px-3 py-2 text-sm outline-none focus:border-amber-500"
              />
            </label>
                        </div>
                        <div className="grid gap-3 sm:grid-cols-[1fr_80px]">
                          <label className="space-y-1">
                            <span className="text-xs font-bold text-stone-500">분류</span>
                            <input
                              value={form.category}
                              onChange={(event) => setForm((prev) => ({ ...prev, category: event.target.value }))}
                              className="w-full rounded-xl border border-stone-200 bg-white px-3 py-2 text-sm outline-none focus:border-amber-500"
                              placeholder="공부"
                            />
                          </label>
                          <label className="space-y-1">
                            <span className="text-xs font-bold text-stone-500">색상</span>
                            <input
                              type="color"
                              value={form.color}
                              onChange={(event) => setForm((prev) => ({ ...prev, color: event.target.value }))}
                              className="h-10 w-full rounded-xl border border-stone-200 bg-white p-1"
                            />
                          </label>
                        </div>
          <div className="mt-3 flex flex-wrap gap-2">
            {DAY_OPTIONS.map((day) => (
              <button
                key={day.value}
                type="button"
                onClick={() => toggleDay(day.value)}
                className={`h-9 w-9 rounded-full text-sm font-black ${
                  form.daysOfWeek.includes(day.value)
                    ? "bg-amber-600 text-white"
                    : "bg-white text-stone-500 ring-1 ring-stone-200"
                }`}
              >
                {day.label}
              </button>
            ))}
          </div>
          <label className="mt-3 block space-y-1">
            <span className="text-xs font-bold text-stone-500">메모</span>
            <input
              value={form.memo}
              onChange={(event) => setForm((prev) => ({ ...prev, memo: event.target.value }))}
              className="w-full rounded-xl border border-stone-200 bg-white px-3 py-2 text-sm outline-none focus:border-amber-500"
              placeholder="준비물, 장소, 목표 등"
            />
          </label>
          <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <label className="inline-flex items-center gap-2 text-sm font-bold text-stone-700">
              <input
                type="checkbox"
                checked={form.isActive}
                onChange={(event) => setForm((prev) => ({ ...prev, isActive: event.target.checked }))}
              />
              활성화
            </label>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={resetForm}
                className="inline-flex items-center justify-center gap-2 rounded-xl border border-stone-200 bg-white px-4 py-2 text-sm font-bold text-stone-700"
              >
                <X size={16} />
                취소
              </button>
              <button
                type="button"
                onClick={() => void handleSubmit()}
                className="inline-flex items-center justify-center gap-2 rounded-xl bg-amber-600 px-4 py-2 text-sm font-bold text-white"
              >
                <Save size={16} />
                            {item.id.startsWith("draft-") ? "추가 저장" : "수정 저장"}
              </button>
            </div>
          </div>
                      </div>
                    ) : (
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="mb-2 h-1.5 w-16 rounded-full" style={{ backgroundColor: item.color }} />
                            <div className="mb-2 flex flex-wrap gap-1">
                              <span className={`rounded-full px-2 py-0.5 text-[11px] font-black ${isToday ? "bg-amber-100 text-amber-800" : "bg-stone-200 text-stone-600"}`}>
                                {isToday ? "오늘 해당" : "오늘 해당 없음"}
                              </span>
                              <span className="rounded-full bg-white px-2 py-0.5 text-[11px] font-bold text-stone-600">
                                {formatDays(item.days_of_week)}
                              </span>
                            </div>
                    <h3 className="truncate text-sm font-black text-stone-950">{item.title}</h3>
                    <div className="mt-1 flex items-center gap-2 text-sm font-bold text-stone-600">
                      <Clock3 size={15} />
                      {item.start_time.slice(0, 5)} - {item.end_time.slice(0, 5)}
                    </div>
                            <p className="mt-1 text-xs font-black text-stone-500">하루 소요 {formatDuration(duration)}</p>
                    {item.category ? <p className="mt-1 text-xs font-bold text-amber-700">{item.category}</p> : null}
                    {item.memo ? <p className="mt-2 line-clamp-2 text-xs text-stone-500">{item.memo}</p> : null}
                  </div>
                  <div className="flex shrink-0 gap-1">
                    <button
                      type="button"
                      onClick={() => startEdit(item)}
                      className="rounded-lg border border-stone-200 bg-white px-2 py-1 text-xs font-bold text-stone-700 hover:bg-stone-100"
                    >
                      수정
                    </button>
                    <button
                      type="button"
                      onClick={() => void handleDelete(item.id)}
                      className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-red-200 bg-white text-red-600 hover:bg-red-50"
                      aria-label={`${item.title} 삭제`}
                    >
                      <Trash2 size={15} />
                    </button>
                  </div>
                </div>
                    )}
              </article>
                );
              })}
              {sortedItems.length === 0 ? (
                <div className="rounded-xl border border-dashed border-stone-200 py-8 text-center text-sm font-semibold text-stone-400 md:col-span-2 xl:col-span-3">
                  등록된 시간표가 없습니다.
                </div>
              ) : null}
            </div>
          </section>
        </div>
      )}
    </section>
  );
};

export default DailySchedulePanel;
