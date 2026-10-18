import { useRef, useState } from "react";
import { Link } from "react-router-dom";
import { X } from "lucide-react";
import { v4 as uuidv4 } from "uuid";
import type { TextBoxElement } from "@/entities/canvas";
import { getDiary, putDiary } from "@/entities/diary";
import { postTaskData, type TaskProps } from "@/entities/task";
import { suggestCanvasPlans, addSuggestedSchedule, type CanvasPlanSuggestion } from "@/features/planner";

export const CanvasPlannerSuggestions = ({ textBoxes, onClose }: { textBoxes: TextBoxElement[]; onClose: () => void }) => {
  const [items, setItems] = useState(() => suggestCanvasPlans(textBoxes));
  const [added, setAdded] = useState<string[]>([]);
  const [saving, setSaving] = useState<string | null>(null);
  const [error, setError] = useState("");
  const submittingRef = useRef(false);
  const patch = (id: string, next: Partial<CanvasPlanSuggestion>) => setItems((current) => current.map((item) => item.id === id ? { ...item, ...next } : item));
  const add = async (item: CanvasPlanSuggestion) => {
    if (submittingRef.current || added.includes(item.id)) return;
    submittingRef.current = true;
    setSaving(item.id);
    setError("");
    try {
      if (item.kind === "task") {
        await postTaskData({ id: uuidv4(), task_name: item.title.trim(), due_date: item.date, status: "TODO" } as TaskProps);
      } else {
        const existing = await getDiary(item.date);
        await putDiary(item.date, addSuggestedSchedule(existing, item, uuidv4()));
      }
      setAdded((current) => [...current, item.id]);
    } catch (failure) {
      setError(failure instanceof Error && !('isAxiosError' in failure) ? failure.message : "추가하지 못했습니다. 연결과 플래너를 확인한 뒤 다시 시도해주세요.");
    } finally {
      submittingRef.current = false;
      setSaving(null);
    }
  };
  return (
    <aside aria-label="캔버스 플래너 제안" data-canvas-touch-allow="true"
      className="absolute inset-x-2 bottom-2 top-36 z-[70] flex flex-col rounded-2xl border border-stone-200 bg-white p-4 text-stone-950 shadow-xl sm:left-auto sm:w-96 lg:top-20"
      style={{ userSelect: "text", touchAction: "pan-y" }}
      onKeyDown={(event) => { event.stopPropagation(); if (event.key === "Escape" && !saving) onClose(); }}>
      <div className="flex items-center justify-between gap-2">
        <h2 className="font-bold">캔버스에서 플래너 제안</h2>
        <button type="button" onClick={onClose} disabled={Boolean(saving)} aria-label="플래너 제안 닫기" className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full hover:bg-stone-100"><X size={18} /></button>
      </div>
      <p className="mb-3 text-xs text-stone-600">텍스트 박스에서 날짜·시간을 찾아 제안합니다. 내용을 확인하고 추가하세요. 손글씨·이미지는 인식하지 않습니다.</p>
      <div className="min-h-0 flex-1 space-y-3 overflow-y-auto overscroll-contain">
        {items.length === 0 && <p className="rounded-lg bg-stone-50 p-3 text-sm">제안할 텍스트가 없습니다. 캔버스에 텍스트로 할 일이나 “내일 14:00~15:00 회의”를 작성해주세요.</p>}
        {items.map((item) => {
          const done = added.includes(item.id);
          return <form key={item.id} className="grid gap-2 rounded-xl border border-stone-200 p-3" onSubmit={(event) => { event.preventDefault(); void add(item); }}>
            <fieldset disabled={done || Boolean(saving)} className="grid min-w-0 gap-2">
              <label className="grid gap-1 text-xs font-bold">제안 내용<input required maxLength={200} value={item.title} onChange={(event) => patch(item.id, { title: event.target.value })} className="min-h-11 min-w-0 rounded-lg border border-stone-300 px-2 text-sm font-normal" /></label>
              <div className="grid grid-cols-2 gap-2">
                <label className="grid gap-1 text-xs font-bold">종류<select value={item.kind} onChange={(event) => patch(item.id, { kind: event.target.value as CanvasPlanSuggestion['kind'] })} className="min-h-11 min-w-0 rounded-lg border border-stone-300 bg-white px-2 text-sm font-normal"><option value="task">작업</option><option value="schedule">일정</option></select></label>
                <label className="grid gap-1 text-xs font-bold">날짜<input required type="date" value={item.date} onChange={(event) => patch(item.id, { date: event.target.value })} className="min-h-11 min-w-0 rounded-lg border border-stone-300 px-2 text-sm font-normal" /></label>
              </div>
              {item.kind === "schedule" && <div className="grid grid-cols-2 gap-2">
                <label className="grid gap-1 text-xs font-bold">시작 시간<input required type="time" step={300} value={item.startTime} onChange={(event) => patch(item.id, { startTime: event.target.value })} className="min-h-11 min-w-0 rounded-lg border border-stone-300 px-2 text-sm" /></label>
                <label className="grid gap-1 text-xs font-bold">종료 시간<input required type="time" step={300} value={item.endTime} onChange={(event) => patch(item.id, { endTime: event.target.value })} className="min-h-11 min-w-0 rounded-lg border border-stone-300 px-2 text-sm" /></label>
              </div>}
              <button type="submit" disabled={!item.title.trim()} className="min-h-11 rounded-lg bg-stone-950 px-3 text-sm font-bold text-white disabled:opacity-50">{done ? "추가됨" : saving === item.id ? "추가 중…" : "플래너에 추가"}</button>
            </fieldset>
          </form>;
        })}
      </div>
      {error && <p role="alert" className="mt-2 text-sm text-red-700">{error}</p>}
      {added.length > 0 && <p role="status" className="mt-2 text-sm text-emerald-700">{added.length}건을 플래너에 추가했습니다.</p>}
      <Link to="/planner" className="mt-3 inline-flex min-h-11 items-center justify-center rounded-lg border border-stone-300 text-sm font-bold">플래너 열기</Link>
    </aside>
  );
};
