import { useCallback, useEffect, useRef, useState } from "react";
import { v4 as uuidv4 } from "uuid";
import {
  getDiary,
  putDiary,
  DEFAULT_DIARY_GRID,
  DIARY_COLOR_PRESETS,
  type DiaryGrid,
  type DiaryJournalBlock,
  type DiaryTodo,
} from "@/entities/diary";

export type DiaryLoadStatus = "loading" | "ready" | "error";
export type DiarySaveStatus = "idle" | "saving" | "saved" | "error";
export type DiaryTool = "paint" | "erase";

export const toDateKey = (date: Date) => {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
};

const shiftDate = (dateKey: string, days: number) => {
  const [y, m, d] = dateKey.split("-").map(Number);
  const base = new Date(y, (m ?? 1) - 1, d ?? 1);
  base.setDate(base.getDate() + days);
  return toDateKey(base);
};

const SAVE_DEBOUNCE_MS = 800;

export const useDiary = () => {
  const [date, setDateState] = useState(() => toDateKey(new Date()));
  const [todos, setTodos] = useState<DiaryTodo[]>([]);
  const [grid, setGrid] = useState<DiaryGrid>({ ...DEFAULT_DIARY_GRID, cells: {} });
  const [journal, setJournal] = useState<DiaryJournalBlock[]>([]);
  const [loadStatus, setLoadStatus] = useState<DiaryLoadStatus>("loading");
  const [saveStatus, setSaveStatus] = useState<DiarySaveStatus>("idle");
  const [activeTodoId, setActiveTodoId] = useState<string | null>(null);
  const [tool, setTool] = useState<DiaryTool>("paint");

  // 저장 디바운스는 effect가 아니라 액션에서 직접 호출한다(로드 시의 setState가 저장을 유발하지 않도록).
  const todosRef = useRef(todos);
  const gridRef = useRef(grid);
  const journalRef = useRef(journal);
  const dateRef = useRef(date);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const loadTokenRef = useRef(0);

  useEffect(() => { todosRef.current = todos; }, [todos]);
  useEffect(() => { gridRef.current = grid; }, [grid]);
  useEffect(() => { journalRef.current = journal; }, [journal]);
  useEffect(() => { dateRef.current = date; }, [date]);

  const flushSave = useCallback(async (targetDate: string) => {
    try {
      setSaveStatus("saving");
      await putDiary(targetDate, {
        todos: todosRef.current,
        grid: gridRef.current,
        journal: journalRef.current,
      });
      // 저장 도중 날짜가 바뀌었으면 상태 표시를 덮어쓰지 않는다.
      if (dateRef.current === targetDate) setSaveStatus("saved");
    } catch (error) {
      console.error("일기 저장 실패:", error);
      if (dateRef.current === targetDate) setSaveStatus("error");
    }
  }, []);

  const scheduleSave = useCallback(() => {
    const targetDate = dateRef.current;
    setSaveStatus("saving");
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(() => {
      saveTimerRef.current = null;
      void flushSave(targetDate);
    }, SAVE_DEBOUNCE_MS);
  }, [flushSave]);

  // 날짜 변경 시 로드. 오래된 응답이 최신 날짜를 덮어쓰지 않도록 토큰으로 가드한다.
  useEffect(() => {
    const token = ++loadTokenRef.current;
    let active = true;
    const load = async () => {
      setLoadStatus("loading");
      setSaveStatus("idle");
      try {
        const entry = await getDiary(date);
        if (!active || token !== loadTokenRef.current) return;
        setTodos(entry.todos);
        setGrid(entry.grid);
        setJournal(entry.journal);
        setActiveTodoId(entry.todos.find((todo) => !todo.done)?.id ?? entry.todos[0]?.id ?? null);
        setLoadStatus("ready");
      } catch (error) {
        if (!active || token !== loadTokenRef.current) return;
        console.error("일기 불러오기 실패:", error);
        setLoadStatus("error");
      }
    };
    void load();
    return () => { active = false; };
  }, [date]);

  useEffect(() => () => {
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
  }, []);

  const setDate = useCallback((next: string) => setDateState(next), []);
  const goToDate = useCallback((offset: number) => setDateState((current) => shiftDate(current, offset)), []);
  const goToday = useCallback(() => setDateState(toDateKey(new Date())), []);

  const reload = useCallback(() => setDateState((current) => current), []);

  const addTodo = useCallback((label: string, color?: string) => {
    const trimmed = label.trim();
    if (!trimmed) return;
    const resolvedColor = color ?? DIARY_COLOR_PRESETS[todosRef.current.length % DIARY_COLOR_PRESETS.length];
    const todo: DiaryTodo = { id: uuidv4(), label: trimmed, color: resolvedColor, done: false };
    setTodos((current) => [...current, todo]);
    setActiveTodoId((current) => current ?? todo.id);
    scheduleSave();
    return todo.id;
  }, [scheduleSave]);

  const updateTodo = useCallback((id: string, patch: Partial<Omit<DiaryTodo, "id">>) => {
    setTodos((current) => current.map((todo) => (todo.id === id ? { ...todo, ...patch } : todo)));
    scheduleSave();
  }, [scheduleSave]);

  const toggleTodoDone = useCallback((id: string) => {
    setTodos((current) => current.map((todo) => (todo.id === id ? { ...todo, done: !todo.done } : todo)));
    scheduleSave();
  }, [scheduleSave]);

  const deleteTodo = useCallback((id: string) => {
    setTodos((current) => current.filter((todo) => todo.id !== id));
    // 삭제된 할일로 칠해진 칸도 함께 제거한다.
    setGrid((current) => {
      const cells = Object.fromEntries(Object.entries(current.cells).filter(([, todoId]) => todoId !== id));
      return { ...current, cells };
    });
    setActiveTodoId((current) => (current === id ? null : current));
    scheduleSave();
  }, [scheduleSave]);

  const paintCell = useCallback((slot: number) => {
    if (tool === "erase") {
      setGrid((current) => {
        if (!(slot in current.cells)) return current;
        const cells = { ...current.cells };
        delete cells[String(slot)];
        return { ...current, cells };
      });
      scheduleSave();
      return;
    }
    const todoId = activeTodoId;
    if (!todoId) return;
    setGrid((current) => {
      if (current.cells[String(slot)] === todoId) return current;
      return { ...current, cells: { ...current.cells, [String(slot)]: todoId } };
    });
    scheduleSave();
  }, [activeTodoId, tool, scheduleSave]);

  const setJournalBlocks = useCallback((blocks: DiaryJournalBlock[]) => {
    setJournal(blocks);
    scheduleSave();
  }, [scheduleSave]);

  return {
    date, setDate, goToDate, goToday, reload,
    todos, grid, journal,
    loadStatus, saveStatus,
    activeTodoId, setActiveTodoId,
    tool, setTool,
    addTodo, updateTodo, toggleTodoDone, deleteTodo,
    paintCell,
    setJournalBlocks,
  };
};
