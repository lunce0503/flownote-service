import { useEffect, useMemo, useState } from "react";
import { CalendarClock, Clock3, Plus, Save, Trash2, X } from "lucide-react";
import {
  createScheduleItem,
  deleteScheduleItem,
  listScheduleItems,
  updateScheduleItem,
} from "../../entities/schedule/api";
import type { DayOfWeek, ScheduleItem, ScheduleItemInput } from "../../entities/schedule";

const DAY_OPTIONS: Array<{ value: DayOfWeek; label: string }> = [
  { value: "MON", label: "월" },
  { value: "TUE", label: "화" },
  { value: "WED", label: "수" },
  { value: "THU", label: "목" },
  { value: "FRI", label: "금" },
  { value: "SAT", label: "토" },
  { value: "SUN", label: "일" },
];

const EMPTY_FORM: ScheduleItemInput = {
  title: "",
  daysOfWeek: ["MON", "TUE", "WED", "THU", "FRI"],
  startTime: "09:00",
  endTime: "10:00",
  category: "",
  color: "#0f766e",
  memo: "",
  isActive: true,
};

const toInput = (item: ScheduleItem): ScheduleItemInput => ({
  title: item.title,
  daysOfWeek: item.days_of_week,
  startTime: item.start_time.slice(0, 5),
  endTime: item.end_time.slice(0, 5),
  category: item.category ?? "",
  color: item.color || "#0f766e",
  memo: item.memo ?? "",
  isActive: item.is_active,
});

const getToday = (): DayOfWeek => {
  const day = new Date().getDay();
  return (["SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT"] as DayOfWeek[])[day];
};

const formatDateLabel = () =>
  new Intl.DateTimeFormat("ko-KR", {
    month: "long",
    day: "numeric",
    weekday: "long",
  }).format(new Date());

const DailySchedulePanel = () => {
  const [items, setItems] = useState<ScheduleItem[]>([]);
  const [form, setForm] = useState<ScheduleItemInput>(EMPTY_FORM);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const today = getToday();
  const todayItems = useMemo(
    () => items
      .filter((item) => item.is_active && item.days_of_week.includes(today))
      .sort((a, b) => a.start_time.localeCompare(b.start_time)),
    [items, today],
  );

  const fetchItems = async () => {
    setIsLoading(true);
    setError(null);
    try {
      setItems(await listScheduleItems());
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
    setForm(EMPTY_FORM);
    setEditingId(null);
    setIsFormOpen(false);
    setError(null);
  };

  const validate = () => {
    if (!form.title.trim()) return "시간표 제목을 입력하세요.";
    if (form.daysOfWeek.length === 0) return "반복 요일을 하나 이상 선택하세요.";
    if (!form.startTime || !form.endTime || form.startTime >= form.endTime) return "시작 시간은 종료 시간보다 빨라야 합니다.";
    return null;
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
        const updated = await updateScheduleItem(editingId, form);
        if (updated) {
          setItems((prev) => prev.map((item) => (item.id === editingId ? updated : item)));
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
    setForm(toInput(item));
    setIsFormOpen(true);
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
          onClick={() => {
            setIsFormOpen(true);
            setEditingId(null);
            setForm(EMPTY_FORM);
            setError(null);
          }}
          className="inline-flex items-center justify-center gap-2 rounded-xl bg-stone-900 px-4 py-2 text-sm font-bold text-white hover:bg-stone-700"
        >
          <Plus size={18} />
          시간표 추가
        </button>
      </div>

      {error ? <div className="mb-3 rounded-xl bg-red-50 px-4 py-3 text-sm font-semibold text-red-700">{error}</div> : null}

      {isFormOpen ? (
        <div className="mb-4 rounded-2xl border border-stone-200 bg-stone-50 p-3">
          <div className="grid gap-3 md:grid-cols-[minmax(180px,1fr)_120px_120px_140px_80px]">
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
                {editingId ? "수정 저장" : "시간표 저장"}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {isLoading ? (
        <div className="rounded-xl border border-dashed border-stone-200 py-10 text-center text-sm font-semibold text-stone-400">
          시간표를 불러오는 중...
        </div>
      ) : todayItems.length === 0 ? (
        <div className="rounded-xl border border-dashed border-stone-200 py-10 text-center text-sm font-semibold text-stone-400">
          오늘 반복 시간표가 없습니다.
        </div>
      ) : (
        <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-3">
          {todayItems.map((item) => (
            <article key={item.id} className="rounded-xl border border-stone-200 bg-stone-50 p-3">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="mb-2 h-1.5 w-16 rounded-full" style={{ backgroundColor: item.color }} />
                  <h3 className="truncate text-sm font-black text-stone-950">{item.title}</h3>
                  <div className="mt-1 flex items-center gap-2 text-sm font-bold text-stone-600">
                    <Clock3 size={15} />
                    {item.start_time.slice(0, 5)} - {item.end_time.slice(0, 5)}
                  </div>
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
            </article>
          ))}
        </div>
      )}
    </section>
  );
};

export default DailySchedulePanel;
