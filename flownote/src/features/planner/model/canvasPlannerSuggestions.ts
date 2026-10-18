import type { DiaryGrid, DiaryTodo, DiaryJournalBlock } from "@/entities/diary";

export type CanvasPlanSuggestion = {
  id: string;
  kind: "task" | "schedule";
  title: string;
  date: string;
  startTime: string;
  endTime: string;
};

const dateKey = (date: Date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
const minutesOf = (value: string) => {
  const match = /^(\d{2}):(\d{2})$/.exec(value);
  if (!match) return NaN;
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  return hours < 24 && minutes < 60 ? hours * 60 + minutes : NaN;
};

// Local text heuristics: no canvas content is sent to an AI or third-party service.
export const suggestCanvasPlans = (boxes: { id: string; text: string; status?: string }[], today = new Date()): CanvasPlanSuggestion[] => {
  const result: CanvasPlanSuggestion[] = [];
  const seen = new Set<string>();
  for (const box of boxes) {
    if (box.status === "deleted") continue;
    for (const [index, raw] of box.text.slice(0, 20000).split(/\r?\n/).entries()) {
      if (/^\s*[-*]?\s*\[[xX]\]/.test(raw)) continue;
      let title = raw.trim().replace(/^[-*•]\s*/, "").replace(/^\[\s*\]\s*/, "").trim();
      if (!title || /^#+\s/.test(title)) continue;
      let date = dateKey(today);
      const explicitDate = /\b(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})\b/.exec(title);
      if (explicitDate) {
        const parsed = new Date(Number(explicitDate[1]), Number(explicitDate[2]) - 1, Number(explicitDate[3]));
        if (parsed.getFullYear() === Number(explicitDate[1]) && parsed.getMonth() === Number(explicitDate[2]) - 1 && parsed.getDate() === Number(explicitDate[3])) {
          date = dateKey(parsed);
          title = title.replace(explicitDate[0], "").trim();
        }
      } else if (/오늘|내일|모레/.test(title)) {
        const relative = /오늘|내일|모레/.exec(title)!;
        const parsed = new Date(today);
        parsed.setDate(parsed.getDate() + (relative[0] === "모레" ? 2 : relative[0] === "내일" ? 1 : 0));
        date = dateKey(parsed);
        title = title.replace(relative[0], "").trim();
      }
      const timeRange = /\b(\d{1,2}:\d{2})\s*[~–—-]\s*(\d{1,2}:\d{2})\b/.exec(title);
      let startTime = "09:00";
      let endTime = "10:00";
      let kind: CanvasPlanSuggestion["kind"] = "task";
      if (timeRange) {
        const start = timeRange[1].padStart(5, "0");
        const end = timeRange[2].padStart(5, "0");
        if (minutesOf(start) < minutesOf(end)) {
          startTime = start;
          endTime = end;
          kind = "schedule";
          title = title.replace(timeRange[0], "").trim();
        }
      }
      title = title.replace(/\s+/g, " ").slice(0, 200);
      if (title.length < 2) continue;
      const key = `${kind}:${date}:${startTime}:${endTime}:${title}`;
      if (seen.has(key)) continue;
      seen.add(key);
      result.push({ id: `${box.id}:${index}`, kind, title, date, startTime, endTime });
      if (result.length >= 30) return result;
    }
  }
  return result;
};

type PlannerEntry = { todos: DiaryTodo[]; grid: DiaryGrid; journal: DiaryJournalBlock[] };
export const addSuggestedSchedule = (entry: PlannerEntry, suggestion: Pick<CanvasPlanSuggestion, "title" | "startTime" | "endTime">, id: string): PlannerEntry => {
  const start = minutesOf(suggestion.startTime);
  const end = minutesOf(suggestion.endTime);
  if (!Number.isFinite(start) || !Number.isFinite(end) || start >= end) throw new Error("시작·종료 시간을 확인해주세요.");
  const slotMinutes = 60 / entry.grid.cols;
  if (start < entry.grid.startHour * 60 || end > entry.grid.endHour * 60) throw new Error("시간표 범위를 벗어난 일정입니다.");
  const first = Math.floor((start - entry.grid.startHour * 60) / slotMinutes);
  const last = Math.ceil((end - entry.grid.startHour * 60) / slotMinutes);
  const cells = { ...entry.grid.cells };
  for (let slot = first; slot < last; slot += 1) {
    if (cells[String(slot)]) throw new Error("기존 시간표와 겹칩니다. 시간을 변경해주세요.");
    cells[String(slot)] = id;
  }
  return { ...entry, todos: [...entry.todos, { id, label: suggestion.title.trim(), color: "#3b82f6", done: false }], grid: { ...entry.grid, cells } };
};
