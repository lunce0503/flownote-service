import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { v4 as uuidv4 } from "uuid";
import { useDiary } from "./useDiary";
import {
  listScheduleItems,
  createScheduleItem,
  updateScheduleItem,
  deleteScheduleItem,
  type ScheduleItem,
  type ScheduleItemInput,
} from "@/entities/schedule";
import { getTasksData, postTaskData, updateTaskData, deleteTasksData, type TaskProps } from "@/entities/task";
import { getDiaryDates } from "@/entities/diary";
import { parseDateKey, scheduleItemsOnDate } from "./calendarEvent";

export type PlannerView = "day" | "week" | "month";

// 요약 작업: 플래너에서는 작업의 부가 기능(노트·게시글 링크, 태그, 타임로그 등)을 쓰지 않고
// 이름·마감일·상태만 다룬다. 상세 관리가 필요하면 백엔드 계약은 그대로이므로 확장 가능.
export type PlannerTaskSummary = {
  id: string;
  name: string;
  dueDate: string | null;
  done: boolean;
};

const toSummary = (task: TaskProps): PlannerTaskSummary => ({
  id: task.id,
  name: task.task_name,
  dueDate: task.due_date ? String(task.due_date).slice(0, 10) : null,
  done: task.status === "DONE",
});

export const usePlanner = () => {
  const diary = useDiary();
  const [view, setView] = useState<PlannerView>("day");
  const [scheduleItems, setScheduleItems] = useState<ScheduleItem[]>([]);
  const [tasks, setTasks] = useState<PlannerTaskSummary[]>([]);
  const [diaryDates, setDiaryDates] = useState<string[]>([]);
  const [sideStatus, setSideStatus] = useState<"loading" | "ready" | "error">("loading");
  const mountedRef = useRef(true);

  useEffect(() => () => { mountedRef.current = false; }, []);

  const loadSideData = useCallback(async () => {
    setSideStatus("loading");
    try {
      const [items, taskList, dates] = await Promise.all([
        listScheduleItems(),
        getTasksData(),
        getDiaryDates().catch(() => [] as string[]),
      ]);
      if (!mountedRef.current) return;
      setScheduleItems(items);
      setTasks(taskList.map(toSummary));
      setDiaryDates(dates);
      setSideStatus("ready");
    } catch (error) {
      console.error("플래너 데이터 불러오기 실패:", error);
      if (mountedRef.current) setSideStatus("error");
    }
  }, []);

  const loadSideDataRef = useRef(loadSideData);
  useEffect(() => { loadSideDataRef.current = loadSideData; }, [loadSideData]);

  // 최초 1회 로드. effect 본문에서 직접 setState 하지 않도록 내부 async 함수로 감싼다.
  useEffect(() => {
    const run = async () => { await loadSideDataRef.current(); };
    void run();
  }, []);

  const refreshSideData = useCallback(() => loadSideDataRef.current(), []);

  // 월간 보기로 전환할 때 최신 일기 날짜·일정을 다시 읽어 캘린더 표시를 맞춘다.
  const changeView = useCallback((next: PlannerView) => {
    setView(next);
    if (next === "month") void loadSideDataRef.current();
  }, []);

  const selectedDate = useMemo(() => parseDateKey(diary.date), [diary.date]);

  // 선택한 날짜에 해당하는 반복 일정(일기 시간표에 투명하게 겹쳐 보여줄 대상).
  const scheduleForSelectedDay = useMemo(
    () => scheduleItemsOnDate(scheduleItems, selectedDate),
    [scheduleItems, selectedDate],
  );

  const saveScheduleItem = useCallback(async (input: ScheduleItemInput, id?: string) => {
    if (id) {
      const updated = await updateScheduleItem(id, input);
      setScheduleItems((current) => current.map((item) => (
        item.id === id ? (updated ?? { ...item, ...input, days_of_week: input.daysOfWeek }) : item
      )));
      return;
    }
    const created = await createScheduleItem(input);
    setScheduleItems((current) => [...current, created]);
  }, []);

  const removeScheduleItem = useCallback(async (id: string) => {
    await deleteScheduleItem(id);
    setScheduleItems((current) => current.filter((item) => item.id !== id));
  }, []);

  const toggleTaskDone = useCallback(async (id: string) => {
    const target = tasks.find((task) => task.id === id);
    if (!target) return;
    const nextDone = !target.done;
    setTasks((current) => current.map((task) => (task.id === id ? { ...task, done: nextDone } : task)));
    try {
      await updateTaskData(id, { status: nextDone ? "DONE" : "TODO" } as Partial<TaskProps>);
    } catch (error) {
      console.error("작업 상태 변경 실패:", error);
      setTasks((current) => current.map((task) => (task.id === id ? { ...task, done: !nextDone } : task)));
    }
  }, [tasks]);

  const removeTask = useCallback(async (id: string) => {
    const snapshot = tasks;
    setTasks((current) => current.filter((task) => task.id !== id));
    try {
      await deleteTasksData(id);
    } catch (error) {
      console.error("작업 삭제 실패:", error);
      setTasks(snapshot);
    }
  }, [tasks]);

  // 오늘의 할일을 작업(tasks)으로도 올려 마감일 기준 캘린더에 표시되게 한다.
  const promoteTodoToTask = useCallback(async (label: string, dueDate: string) => {
    const draft = {
      id: uuidv4(),
      task_name: label,
      due_date: dueDate,
      status: "TODO",
    } as unknown as TaskProps;
    try {
      await postTaskData(draft);
      await refreshSideData();
    } catch (error) {
      console.error("작업 생성 실패:", error);
    }
  }, [refreshSideData]);

  return {
    diary,
    view,
    setView: changeView,
    selectedDate,
    scheduleItems,
    scheduleForSelectedDay,
    saveScheduleItem,
    removeScheduleItem,
    tasks,
    toggleTaskDone,
    removeTask,
    promoteTodoToTask,
    diaryDates,
    sideStatus,
    refreshSideData,
  };
};

export type UsePlannerResult = ReturnType<typeof usePlanner>;
