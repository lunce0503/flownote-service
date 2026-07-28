import { useState } from "react";
import { Check, Eraser, Pen, Pencil, Plus, Trash2, CalendarPlus } from "lucide-react";
import { DIARY_COLOR_PRESETS, type DiaryTodo } from "@/entities/diary";
import type { DiaryTool, PlannerTaskSummary } from "@/features/planner";

type Props = {
  todos: DiaryTodo[];
  tasks: PlannerTaskSummary[];
  activeTodoId: string | null;
  tool: DiaryTool;
  penColor: string;
  date: string;
  onSelect: (id: string) => void;
  onAdd: (label: string, color: string) => void;
  onUpdate: (id: string, patch: Partial<Omit<DiaryTodo, "id">>) => void;
  onToggleDone: (id: string) => void;
  onDelete: (id: string) => void;
  onToolChange: (tool: DiaryTool) => void;
  onPenColorChange: (color: string) => void;
  onToggleTask: (id: string) => void;
  onDeleteTask: (id: string) => void;
  onPromoteTodo: (label: string, dueDate: string) => void;
};

const ToolButton = ({ active, onClick, icon, label }: {
  active: boolean; onClick: () => void; icon: React.ReactNode; label: string;
}) => (
  <button
    type="button"
    onClick={onClick}
    className={`flex items-center gap-1 rounded-md px-2 py-1 text-xs font-semibold transition ${
      active ? "bg-black text-white" : "text-neutral-600 hover:bg-neutral-100"
    }`}
    aria-pressed={active}
  >
    {icon} {label}
  </button>
);

const TodoRow = ({ todo, active, onSelect, onUpdate, onToggleDone, onDelete, onPromote }: {
  todo: DiaryTodo;
  active: boolean;
  onSelect: (id: string) => void;
  onUpdate: Props["onUpdate"];
  onToggleDone: Props["onToggleDone"];
  onDelete: Props["onDelete"];
  onPromote: () => void;
}) => (
  <li className={`flex items-center gap-2 rounded-lg border px-2 py-1.5 transition ${
    active ? "border-black bg-neutral-50" : "border-neutral-200 bg-white hover:bg-neutral-50"
  }`}>
    <label
      className="relative h-6 w-6 shrink-0 cursor-pointer rounded-md border border-neutral-200"
      style={{ backgroundColor: todo.color }}
      title="색상 변경"
    >
      <input
        type="color"
        value={todo.color}
        onChange={(event) => onUpdate(todo.id, { color: event.target.value })}
        className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
        aria-label={`${todo.label} 색상`}
      />
    </label>
    <button
      type="button"
      onClick={() => onSelect(todo.id)}
      className={`min-w-0 flex-1 truncate text-left text-sm ${todo.done ? "text-neutral-400 line-through" : "text-black"}`}
      title="이 할일 색으로 시간표 칠하기"
    >
      {todo.label}
    </button>
    <button
      type="button"
      onClick={onPromote}
      className="hidden h-6 w-6 items-center justify-center rounded-md text-neutral-400 hover:text-black sm:flex"
      title="캘린더에 오늘 마감 작업으로 올리기"
    >
      <CalendarPlus size={14} />
    </button>
    <button
      type="button"
      onClick={() => onToggleDone(todo.id)}
      className={`flex h-6 w-6 items-center justify-center rounded-md border ${
        todo.done ? "border-black bg-black text-white" : "border-neutral-300 text-neutral-400 hover:text-black"
      }`}
      title={todo.done ? "완료 해제" : "완료로 표시"}
      aria-pressed={todo.done}
    >
      <Check size={14} />
    </button>
    <button
      type="button"
      onClick={() => onDelete(todo.id)}
      className="flex h-6 w-6 items-center justify-center rounded-md text-neutral-400 hover:text-red-600"
      title="삭제"
    >
      <Trash2 size={14} />
    </button>
  </li>
);

const PlannerTodoPanel = ({
  todos, tasks, activeTodoId, tool, penColor, date,
  onSelect, onAdd, onUpdate, onToggleDone, onDelete,
  onToolChange, onPenColorChange, onToggleTask, onDeleteTask, onPromoteTodo,
}: Props) => {
  const [label, setLabel] = useState("");
  const [color, setColor] = useState<string>(DIARY_COLOR_PRESETS[0]);

  const pending = todos.filter((todo) => !todo.done);
  const done = todos.filter((todo) => todo.done);
  // 요약 작업: 오늘 마감 + 미완료를 우선 노출한다(부가 정보는 표시하지 않는다).
  const relevantTasks = tasks
    .filter((task) => !task.done || task.dueDate === date)
    .sort((left, right) => Number(left.done) - Number(right.done) || (left.dueDate ?? "").localeCompare(right.dueDate ?? ""))
    .slice(0, 8);

  const submit = () => {
    if (!label.trim()) return;
    onAdd(label, color);
    setLabel("");
  };

  return (
    <div className="flex flex-col gap-3 rounded-xl border border-neutral-200 bg-white p-3 text-black">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-sm font-bold">할 일</h3>
        <div className="flex items-center gap-1 rounded-lg bg-neutral-100 p-0.5">
          <ToolButton active={tool === "paint"} onClick={() => onToolChange("paint")} icon={<Pencil size={13} />} label="칠하기" />
          <ToolButton active={tool === "draw"} onClick={() => onToolChange("draw")} icon={<Pen size={13} />} label="펜" />
          <ToolButton active={tool === "erase"} onClick={() => onToolChange("erase")} icon={<Eraser size={13} />} label="지우개" />
        </div>
      </div>

      {tool === "draw" && (
        <label className="flex items-center gap-2 rounded-lg border border-neutral-200 px-2 py-1.5 text-xs">
          <span className="text-neutral-600">펜 색</span>
          <input
            type="color"
            value={penColor}
            onChange={(event) => onPenColorChange(event.target.value)}
            className="h-6 w-10 cursor-pointer rounded border border-neutral-200 bg-white"
            aria-label="펜 색상"
          />
          <span className="text-neutral-500">시간표 위에 직접 필기합니다.</span>
        </label>
      )}

      <div className="flex items-center gap-2">
        <label
          className="relative h-9 w-9 shrink-0 cursor-pointer rounded-lg border border-neutral-200"
          style={{ backgroundColor: color }}
          title="새 할일 색상"
        >
          <input
            type="color"
            value={color}
            onChange={(event) => setColor(event.target.value)}
            className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
            aria-label="새 할일 색상"
          />
        </label>
        <input
          type="text"
          value={label}
          onChange={(event) => setLabel(event.target.value)}
          onKeyDown={(event) => { if (event.key === "Enter") submit(); }}
          placeholder="오늘의 할일"
          className="min-w-0 flex-1 rounded-lg border border-neutral-200 bg-white px-3 py-2 text-sm text-black outline-none focus:border-black"
        />
        <button
          type="button"
          onClick={submit}
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-black text-white transition hover:bg-neutral-700 active:scale-95"
          title="추가"
        >
          <Plus size={18} />
        </button>
      </div>

      <div className="flex flex-wrap gap-1.5">
        {DIARY_COLOR_PRESETS.map((preset) => (
          <button
            key={preset}
            type="button"
            onClick={() => setColor(preset)}
            className={`h-5 w-5 rounded-full border transition ${color === preset ? "border-black ring-2 ring-neutral-300" : "border-white"}`}
            style={{ backgroundColor: preset }}
            aria-label={`색상 ${preset}`}
          />
        ))}
      </div>

      {todos.length === 0 ? (
        <p className="py-2 text-center text-xs text-neutral-500">할일을 추가하고 색을 골라 시간표를 칠해보세요.</p>
      ) : (
        <div className="flex flex-col gap-3">
          {pending.length > 0 && (
            <ul className="flex flex-col gap-1.5">
              {pending.map((todo) => (
                <TodoRow key={todo.id} todo={todo} active={todo.id === activeTodoId}
                  onSelect={onSelect} onUpdate={onUpdate} onToggleDone={onToggleDone} onDelete={onDelete}
                  onPromote={() => onPromoteTodo(todo.label, date)} />
              ))}
            </ul>
          )}
          {done.length > 0 && (
            <div className="flex flex-col gap-1.5">
              <p className="text-xs font-semibold text-neutral-500">완료한 일 ({done.length})</p>
              <ul className="flex flex-col gap-1.5">
                {done.map((todo) => (
                  <TodoRow key={todo.id} todo={todo} active={todo.id === activeTodoId}
                    onSelect={onSelect} onUpdate={onUpdate} onToggleDone={onToggleDone} onDelete={onDelete}
                    onPromote={() => onPromoteTodo(todo.label, date)} />
                ))}
              </ul>
            </div>
          )}
        </div>
      )}

      {/* 작업(요약): 이름·마감일·완료 여부만 다룬다. */}
      <div className="mt-1 flex flex-col gap-1.5 border-t border-neutral-200 pt-3">
        <p className="text-xs font-semibold text-neutral-500">작업 요약</p>
        {relevantTasks.length === 0 ? (
          <p className="text-xs text-neutral-400">등록된 작업이 없습니다.</p>
        ) : (
          <ul className="flex flex-col gap-1.5">
            {relevantTasks.map((task) => (
              <li key={task.id} className="flex items-center gap-2 rounded-lg border border-neutral-200 bg-white px-2 py-1.5">
                <button
                  type="button"
                  onClick={() => onToggleTask(task.id)}
                  className={`flex h-5 w-5 shrink-0 items-center justify-center rounded border ${
                    task.done ? "border-black bg-black text-white" : "border-neutral-300 text-transparent hover:border-black"
                  }`}
                  title={task.done ? "완료 해제" : "완료로 표시"}
                  aria-pressed={task.done}
                >
                  <Check size={12} />
                </button>
                <span className={`min-w-0 flex-1 truncate text-sm ${task.done ? "text-neutral-400 line-through" : "text-black"}`}>
                  {task.name}
                </span>
                {task.dueDate && (
                  <span className={`shrink-0 text-[11px] ${task.dueDate === date ? "font-bold text-black" : "text-neutral-400"}`}>
                    {task.dueDate.slice(5)}
                  </span>
                )}
                <button
                  type="button"
                  onClick={() => onDeleteTask(task.id)}
                  className="flex h-5 w-5 shrink-0 items-center justify-center rounded text-neutral-400 hover:text-red-600"
                  title="작업 삭제"
                >
                  <Trash2 size={13} />
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
};

export default PlannerTodoPanel;
