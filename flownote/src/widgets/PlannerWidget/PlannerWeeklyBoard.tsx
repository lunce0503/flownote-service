import { useState } from "react";
import { Plus, Trash2, X } from "lucide-react";
import type { DayOfWeek, ScheduleItem, ScheduleItemInput } from "@/entities/schedule";
import {
  buildScheduleInputs,
  createSchedulePeriod,
  DAY_OPTIONS,
  EMPTY_SCHEDULE_FORM,
  formatDays,
  getScheduleItemsByDay,
  timeToMinutes,
  toScheduleInput,
  toSchedulePeriod,
  validateScheduleInput,
  validateSchedulePeriods,
  type SchedulePeriodInput,
} from "@/features/schedule";
import { DIARY_COLOR_PRESETS } from "@/entities/diary";
import SchedulePeriodListEditor from "./SchedulePeriodListEditor";

type Props = {
  items: ScheduleItem[];
  today: DayOfWeek;
  onSave: (input: ScheduleItemInput, id?: string) => Promise<ScheduleItem | undefined>;
  onDelete: (id: string) => Promise<void>;
};

const DAY_START_HOUR = 6;
const DAY_END_HOUR = 24;
const COLUMN_HEIGHT = (DAY_END_HOUR - DAY_START_HOUR) * 26;

/**
 * 주간 보드: 요일별로 반복 일정을 임의로 지정한다.
 * 여기서 만든 일정이 일기(일간) 시간표에 투명한 배경으로 겹쳐 보인다.
 */
const PlannerWeeklyBoard = ({ items, today, onSave, onDelete }: Props) => {
  const [form, setForm] = useState<ScheduleItemInput>(EMPTY_SCHEDULE_FORM);
  const [periods, setPeriods] = useState<SchedulePeriodInput[]>(() => [
    createSchedulePeriod({ daysOfWeek: EMPTY_SCHEDULE_FORM.daysOfWeek }),
  ]);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const openCreate = (day?: DayOfWeek) => {
    const daysOfWeek = day ? [day] : EMPTY_SCHEDULE_FORM.daysOfWeek;
    setEditingId(null);
    setForm({ ...EMPTY_SCHEDULE_FORM, daysOfWeek });
    setPeriods([createSchedulePeriod({ daysOfWeek })]);
    setIsFormOpen(true);
    setError(null);
  };

  const openEdit = (item: ScheduleItem) => {
    setEditingId(item.id);
    setForm(toScheduleInput(item));
    setPeriods([toSchedulePeriod(item)]);
    setIsFormOpen(true);
    setError(null);
  };

  const toggleDay = (day: DayOfWeek) => {
    setForm((current) => ({
      ...current,
      daysOfWeek: current.daysOfWeek.includes(day)
        ? current.daysOfWeek.filter((value) => value !== day)
        : [...current.daysOfWeek, day],
    }));
  };

  const submit = async () => {
    const validationError = editingId
      ? validateScheduleInput(form)
      : validateSchedulePeriods(form, periods);
    if (validationError) { setError(validationError); return; }

    setSaving(true);
    setError(null);
    const createdIds: string[] = [];
    try {
      if (editingId) {
        await onSave(form, editingId);
      } else {
        for (const input of buildScheduleInputs(form, periods)) {
          const created = await onSave(input);
          if (created) createdIds.push(created.id);
        }
      }
      setIsFormOpen(false);
      setEditingId(null);
      setForm(EMPTY_SCHEDULE_FORM);
      setPeriods([createSchedulePeriod({ daysOfWeek: EMPTY_SCHEDULE_FORM.daysOfWeek })]);
    } catch (submitError) {
      console.error("일정 저장 실패:", submitError);
      await Promise.allSettled(createdIds.map((id) => onDelete(id)));
      setError("일정을 저장하지 못했습니다.");
    } finally {
      setSaving(false);
    }
  };

  const remove = async (id: string) => {
    try {
      await onDelete(id);
      if (editingId === id) { setIsFormOpen(false); setEditingId(null); }
    } catch (deleteError) {
      console.error("일정 삭제 실패:", deleteError);
    }
  };

  const totalMinutes = (DAY_END_HOUR - DAY_START_HOUR) * 60;
  const startMinutes = DAY_START_HOUR * 60;

  return (
    <section className="flex flex-col gap-3 rounded-xl border border-neutral-200 bg-white p-3 text-black">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h3 className="text-sm font-bold">주간 일정</h3>
          <p className="text-xs text-neutral-500">여기서 지정한 반복 일정이 일간 시간표에 투명하게 표시됩니다.</p>
        </div>
        <button
          type="button"
          onClick={() => openCreate()}
          className="flex items-center gap-1 rounded-lg bg-black px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-neutral-700"
        >
          <Plus size={14} /> 일정 추가
        </button>
      </div>

      {/* 주간 그리드 — 가로 스크롤로 좁은 화면 대응 */}
      <div className="overflow-x-auto rounded-lg border border-neutral-200">
        <div className="grid min-w-[600px] grid-cols-[40px_repeat(7,minmax(0,1fr))]">
          <div className="border-b border-neutral-200 bg-white" />
          {DAY_OPTIONS.map((day) => (
            <button
              key={`head-${day.value}`}
              type="button"
              onClick={() => openCreate(day.value)}
              className={`border-b border-l border-neutral-100 py-2 text-center text-xs font-bold transition hover:bg-neutral-50 ${
                day.value === today ? "bg-neutral-100 text-black" : "text-neutral-500"
              }`}
              title={`${day.label}요일에 일정 추가`}
            >
              {day.label}
              {day.value === today && <span className="ml-1 text-[10px]">오늘</span>}
            </button>
          ))}

          <div className="relative bg-white" style={{ height: COLUMN_HEIGHT }}>
            {Array.from({ length: DAY_END_HOUR - DAY_START_HOUR }, (_, index) => DAY_START_HOUR + index).map((hour, index) => (
              <span
                key={hour}
                className="absolute pl-1 text-[10px] font-medium text-neutral-400"
                style={{ top: `${(index / (DAY_END_HOUR - DAY_START_HOUR)) * 100}%` }}
              >
                {hour}
              </span>
            ))}
          </div>

          {DAY_OPTIONS.map((day) => {
            const dayItems = getScheduleItemsByDay(items, day.value);
            return (
              <div
                key={day.value}
                className={`relative border-l border-neutral-100 ${day.value === today ? "bg-neutral-50" : "bg-white"}`}
                style={{ height: COLUMN_HEIGHT }}
              >
                {Array.from({ length: DAY_END_HOUR - DAY_START_HOUR }, (_, index) => index).map((index) => (
                  <div
                    key={index}
                    className="pointer-events-none absolute left-0 right-0 border-t border-neutral-100"
                    style={{ top: `${(index / (DAY_END_HOUR - DAY_START_HOUR)) * 100}%` }}
                  />
                ))}
                {dayItems.map((item) => {
                  const start = timeToMinutes(item.start_time);
                  const rawEnd = timeToMinutes(item.end_time);
                  const end = rawEnd <= start ? 1440 : rawEnd;
                  const top = ((start - startMinutes) / totalMinutes) * 100;
                  const heightPercent = ((end - start) / totalMinutes) * 100;
                  if (top > 100 || top + heightPercent < 0) return null;
                  return (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => openEdit(item)}
                      className="absolute left-0.5 right-0.5 overflow-hidden rounded px-1 py-0.5 text-left text-[10px] font-semibold text-white shadow-sm transition hover:brightness-110"
                      style={{
                        top: `${Math.max(0, top)}%`,
                        height: `${Math.max(2, heightPercent)}%`,
                        backgroundColor: item.color || "#111111",
                      }}
                      title={`${item.title} ${item.start_time.slice(0, 5)}~${item.end_time.slice(0, 5)}`}
                    >
                      <span className="line-clamp-2">{item.title}</span>
                    </button>
                  );
                })}
              </div>
            );
          })}
        </div>
      </div>

      {/* 목록 (모바일에서 읽기 쉬움) */}
      {items.length > 0 && (
        <ul aria-label="주간 일정 목록" className="flex flex-col gap-1.5">
          {items.map((item) => (
            <li key={item.id} className="flex items-center gap-2 rounded-lg border border-neutral-200 px-2 py-1.5">
              <span className="h-4 w-4 shrink-0 rounded" style={{ backgroundColor: item.color || "#111111" }} />
              <button type="button" onClick={() => openEdit(item)} className="min-w-0 flex-1 text-left">
                <span className="block truncate text-sm font-medium text-black">{item.title}</span>
                <span className="block truncate text-[11px] text-neutral-500">
                  {formatDays(item.days_of_week)} · {item.start_time.slice(0, 5)}~{item.end_time.slice(0, 5)}
                </span>
              </button>
              <button
                type="button"
                onClick={() => remove(item.id)}
                className="flex h-6 w-6 shrink-0 items-center justify-center rounded text-neutral-400 hover:text-red-600"
                title="일정 삭제"
              >
                <Trash2 size={14} />
              </button>
            </li>
          ))}
        </ul>
      )}

      {isFormOpen && (
        <div className="flex flex-col gap-2 rounded-lg border border-neutral-300 bg-neutral-50 p-3">
          <div className="flex items-center justify-between">
            <p className="text-xs font-bold">{editingId ? "일정 수정" : "새 일정"}</p>
            <button type="button" onClick={() => setIsFormOpen(false)} className="text-neutral-400 hover:text-black" aria-label="일정 입력 닫기">
              <X size={16} />
            </button>
          </div>
          <input
            type="text"
            value={form.title}
            onChange={(event) => setForm((current) => ({ ...current, title: event.target.value }))}
            placeholder="일정 이름"
            className="rounded-lg border border-neutral-200 bg-white px-3 py-2 text-sm text-black outline-none focus:border-black"
          />
          {editingId ? (
            <>
              <div className="flex flex-wrap gap-1">
                {DAY_OPTIONS.map((day) => (
                  <button
                    key={day.value}
                    type="button"
                    onClick={() => toggleDay(day.value)}
                    aria-pressed={form.daysOfWeek.includes(day.value)}
                    className={`h-8 w-8 rounded-md border text-xs font-bold transition ${
                      form.daysOfWeek.includes(day.value)
                        ? "border-black bg-black text-white"
                        : "border-neutral-200 bg-white text-neutral-600"
                    }`}
                  >
                    {day.label}
                  </button>
                ))}
              </div>
              <div className="grid max-w-sm grid-cols-2 gap-2">
                <input
                  type="time"
                  aria-label="시작 시간"
                  value={form.startTime}
                  onChange={(event) => setForm((current) => ({ ...current, startTime: event.target.value }))}
                  className="min-w-0 rounded-md border border-neutral-200 bg-white px-2 py-1.5 text-sm text-black outline-none focus:border-black"
                />
                <input
                  type="time"
                  aria-label="종료 시간"
                  value={form.endTime}
                  onChange={(event) => setForm((current) => ({ ...current, endTime: event.target.value }))}
                  className="min-w-0 rounded-md border border-neutral-200 bg-white px-2 py-1.5 text-sm text-black outline-none focus:border-black"
                />
              </div>
            </>
          ) : (
            <SchedulePeriodListEditor periods={periods} onChange={setPeriods} />
          )}
          <div className="flex flex-wrap items-center gap-2">
            <label className="flex items-center gap-1 text-xs text-neutral-600">
              색
              <input
                type="color"
                value={form.color}
                onChange={(event) => setForm((current) => ({ ...current, color: event.target.value }))}
                className="h-8 w-10 cursor-pointer rounded border border-neutral-200 bg-white"
              />
            </label>
            <div className="flex flex-wrap gap-1">
              {DIARY_COLOR_PRESETS.slice(0, 6).map((preset) => (
                <button
                  key={preset}
                  type="button"
                  onClick={() => setForm((current) => ({ ...current, color: preset }))}
                  className="h-5 w-5 rounded-full border border-white"
                  style={{ backgroundColor: preset }}
                  aria-label={`색상 ${preset}`}
                />
              ))}
            </div>
          </div>
          {error && <p className="text-xs text-red-600">{error}</p>}
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={submit}
              disabled={saving}
              className="rounded-lg bg-black px-4 py-2 text-sm font-semibold text-white transition hover:bg-neutral-700 disabled:opacity-50"
            >
              {saving ? "저장 중…" : editingId ? "저장" : `기간 ${periods.length}개 저장`}
            </button>
            {editingId && (
              <button
                type="button"
                onClick={() => remove(editingId)}
                className="rounded-lg border border-neutral-300 px-3 py-2 text-sm text-neutral-700 transition hover:border-red-500 hover:text-red-600"
              >
                삭제
              </button>
            )}
          </div>
        </div>
      )}
    </section>
  );
};

export default PlannerWeeklyBoard;
