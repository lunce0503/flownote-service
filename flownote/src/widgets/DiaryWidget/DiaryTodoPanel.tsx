import { useState } from "react";
import { Check, Eraser, Pencil, Plus, Trash2 } from "lucide-react";
import { DIARY_COLOR_PRESETS, type DiaryTodo } from "@/entities/diary";
import type { DiaryTool } from "@/features/diary";

type Props = {
  todos: DiaryTodo[];
  activeTodoId: string | null;
  tool: DiaryTool;
  onSelect: (id: string) => void;
  onAdd: (label: string, color: string) => void;
  onUpdate: (id: string, patch: Partial<Omit<DiaryTodo, "id">>) => void;
  onToggleDone: (id: string) => void;
  onDelete: (id: string) => void;
  onToolChange: (tool: DiaryTool) => void;
};

const DiaryTodoRow = ({
  todo, active, onSelect, onUpdate, onToggleDone, onDelete,
}: {
  todo: DiaryTodo;
  active: boolean;
  onSelect: (id: string) => void;
  onUpdate: Props["onUpdate"];
  onToggleDone: Props["onToggleDone"];
  onDelete: Props["onDelete"];
}) => (
  <li
    className={`flex items-center gap-2 rounded-lg border px-2 py-1.5 transition ${
      active ? "border-slate-900 bg-slate-50" : "border-slate-200 bg-white hover:bg-slate-50"
    }`}
  >
    <label className="relative h-6 w-6 shrink-0 cursor-pointer rounded-md border border-slate-200" style={{ backgroundColor: todo.color }} title="색상 변경">
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
      className={`min-w-0 flex-1 truncate text-left text-sm ${todo.done ? "text-slate-400 line-through" : "text-slate-800"}`}
      title="이 할일 색으로 칠하기"
    >
      {todo.label}
    </button>
    <button
      type="button"
      onClick={() => onToggleDone(todo.id)}
      className={`flex h-6 w-6 items-center justify-center rounded-md border ${
        todo.done ? "border-green-500 bg-green-500 text-white" : "border-slate-300 text-slate-400 hover:text-slate-600"
      }`}
      title={todo.done ? "완료 해제" : "완료로 표시"}
      aria-pressed={todo.done}
    >
      <Check size={14} />
    </button>
    <button
      type="button"
      onClick={() => onDelete(todo.id)}
      className="flex h-6 w-6 items-center justify-center rounded-md text-slate-400 hover:text-red-500"
      title="삭제"
    >
      <Trash2 size={14} />
    </button>
  </li>
);

const DiaryTodoPanel = ({
  todos, activeTodoId, tool, onSelect, onAdd, onUpdate, onToggleDone, onDelete, onToolChange,
}: Props) => {
  const [label, setLabel] = useState("");
  const [color, setColor] = useState<string>(DIARY_COLOR_PRESETS[0]);

  const pending = todos.filter((todo) => !todo.done);
  const done = todos.filter((todo) => todo.done);

  const submit = () => {
    if (!label.trim()) return;
    onAdd(label, color);
    setLabel("");
  };

  return (
    <div className="flex flex-col gap-3 rounded-xl border border-slate-200 bg-white p-3">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-bold text-slate-800">할 일</h3>
        <div className="flex items-center gap-1 rounded-lg bg-slate-100 p-0.5">
          <button
            type="button"
            onClick={() => onToolChange("paint")}
            className={`flex items-center gap-1 rounded-md px-2 py-1 text-xs font-semibold ${
              tool === "paint" ? "bg-white text-slate-900 shadow-sm" : "text-slate-500"
            }`}
            title="펜: 선택한 할일 색으로 칸을 칠합니다"
          >
            <Pencil size={13} /> 펜
          </button>
          <button
            type="button"
            onClick={() => onToolChange("erase")}
            className={`flex items-center gap-1 rounded-md px-2 py-1 text-xs font-semibold ${
              tool === "erase" ? "bg-white text-slate-900 shadow-sm" : "text-slate-500"
            }`}
            title="지우개: 칠한 칸을 지웁니다"
          >
            <Eraser size={13} /> 지우개
          </button>
        </div>
      </div>

      {/* 새 할일 추가: 라벨 + 색상 지정 */}
      <div className="flex items-center gap-2">
        <label className="relative h-9 w-9 shrink-0 cursor-pointer rounded-lg border border-slate-200" style={{ backgroundColor: color }} title="새 할일 색상">
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
          className="min-w-0 flex-1 rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-slate-900"
        />
        <button
          type="button"
          onClick={submit}
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-slate-900 text-white transition hover:bg-slate-700 active:scale-95"
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
            className={`h-5 w-5 rounded-full border transition ${color === preset ? "border-slate-900 ring-2 ring-slate-300" : "border-white"}`}
            style={{ backgroundColor: preset }}
            aria-label={`색상 ${preset}`}
          />
        ))}
      </div>

      {todos.length === 0 ? (
        <p className="py-3 text-center text-xs text-slate-400">할일을 추가하고 색을 골라 시간표를 칠해보세요.</p>
      ) : (
        <div className="flex flex-col gap-3">
          {pending.length > 0 && (
            <ul className="flex flex-col gap-1.5">
              {pending.map((todo) => (
                <DiaryTodoRow key={todo.id} todo={todo} active={todo.id === activeTodoId}
                  onSelect={onSelect} onUpdate={onUpdate} onToggleDone={onToggleDone} onDelete={onDelete} />
              ))}
            </ul>
          )}
          {done.length > 0 && (
            <div className="flex flex-col gap-1.5">
              <p className="text-xs font-semibold text-slate-400">완료한 일 ({done.length})</p>
              <ul className="flex flex-col gap-1.5">
                {done.map((todo) => (
                  <DiaryTodoRow key={todo.id} todo={todo} active={todo.id === activeTodoId}
                    onSelect={onSelect} onUpdate={onUpdate} onToggleDone={onToggleDone} onDelete={onDelete} />
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default DiaryTodoPanel;
