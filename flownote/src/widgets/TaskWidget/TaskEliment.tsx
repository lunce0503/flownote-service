import { useEffect, useRef, useState } from "react";
import { Bot, CalendarDays, Clock3, FileText, Link2, MoreVertical, Tag, TimerReset, X } from "lucide-react";
import type { TaskProps } from "../../entities/task";

// --- Constants & Styles ---
const STATUS_CONFIG = {
    TODO: { label: '할 일', color: 'bg-slate-100 text-slate-700 ring-slate-200' },
    DOING: { label: '진행 중', color: 'bg-amber-100 text-amber-800 ring-amber-200' },
    DONE: { label: '완료', color: 'bg-emerald-100 text-emerald-800 ring-emerald-200' },
};

const DIFFICULTY_CONFIG = {
    1: { label: '쉬움', color: 'bg-green-200' },
    2: { label: '보통', color: 'bg-yellow-200' },
    3: { label: '어려움', color: 'bg-red-200' },
};

// --- Components ---
const TaskHeader = () => (
  <div className="hidden grid-cols-12 gap-3 rounded-xl border border-stone-200 bg-stone-100 px-4 py-3 text-xs font-bold uppercase tracking-wide text-stone-500 md:grid">
    <div className="col-span-3">일정</div>
    <div className="col-span-1 text-center">상태</div>
    <div className="col-span-1 text-center">분류</div>
    <div className="col-span-1 text-center">난이도</div>
    <div className="col-span-2 text-center">시간</div>
    <div className="col-span-1 text-center">마감</div>
    <div className="col-span-2 text-center">태그 / 링크</div>
    <div className="col-span-1 text-right">메뉴</div>
  </div>
);

const normalizeTags = (value: string) => (
    value
        .split(",")
        .map((tag) => tag.trim())
        .filter(Boolean)
);

const getMemoHref = (memo: string | null) => {
    const value = memo?.trim();
    if (!value) return null;
    if (value.startsWith("/")) return value;

    try {
        return new URL(value).href;
    } catch {
        return null;
    }
};

const TaskItem = ({ 
        task, 
        onDelete, 
        onChange 
    }: {
        task: TaskProps;
        onDelete: (id: string) => void;
        onChange: (updateTask: TaskProps) => void;
    }) => {

        const handleUpdate = (field: keyof TaskProps, value: any) => {
            onChange({ ...task, [field]: value, update_at: new Date() });
        };
        const [isMenuOpen, setIsMenuOpen] = useState(false);
        const menuRef = useRef<HTMLDivElement>(null);

        useEffect(() => {
            if (!isMenuOpen) return;

            const handlePointerDown = (event: PointerEvent) => {
                if (!menuRef.current?.contains(event.target as Node)) {
                    setIsMenuOpen(false);
                }
            };

            document.addEventListener("pointerdown", handlePointerDown);
            return () => document.removeEventListener("pointerdown", handlePointerDown);
        }, [isMenuOpen]);
        
        const cycleStatus = () => {
            const sequence: TaskProps['status'][] = ['TODO', 'DOING', 'DONE'];
            const nextIndex = (sequence.indexOf(task.status) + 1 ) % sequence.length;
            handleUpdate('status', sequence[nextIndex]);
        }

        const cycleDifficulty = () => {
            const sequence: TaskProps['difficulty_level'][] = [1, 2, 3];
            const nextIndex = (sequence.indexOf(task.difficulty_level) + 1) % sequence.length;
            handleUpdate('difficulty_level', sequence[nextIndex]);
        }

        return (
            <div className="grid grid-cols-12 gap-3 rounded-xl border border-stone-200 bg-white px-4 py-4 text-stone-900 shadow-sm transition-all hover:border-stone-300 hover:shadow-md">
                {/* Task Name */}
                <div className="col-span-12 space-y-2 md:col-span-3">
                    <label className="text-xs font-bold text-stone-500 md:hidden">일정</label>
                    <input type="text"
                        value={task.task_name}
                        onChange={(e) => handleUpdate('task_name', e.target.value)}
                        className="w-full rounded-lg border border-transparent bg-stone-50 px-3 py-2 text-sm font-semibold text-stone-900 outline-none transition-colors focus:border-blue-300 focus:bg-white focus:ring-2 focus:ring-blue-100"
                        placeholder="일정명을 입력하세요"
                    />
                    <textarea
                        value={task.description || ""}
                        onChange={(e) => handleUpdate("description", e.target.value)}
                        className="min-h-16 w-full resize-y rounded-lg border border-stone-200 bg-white px-3 py-2 text-xs text-stone-600 outline-none focus:border-blue-300 focus:ring-2 focus:ring-blue-100"
                        placeholder="설명"
                    />
                </div>

                {/* Task Status */}
                <div className="col-span-4 flex flex-col items-start gap-2 md:col-span-1 md:items-center">
                    <label className="text-xs font-bold text-stone-500 md:hidden">상태</label>
                    <button 
                    onClick={cycleStatus}
                    className={`${STATUS_CONFIG[task.status].color} w-full rounded-full px-3 py-1.5 text-xs font-bold ring-1 transition-all md:w-20`}
                    >
                    {STATUS_CONFIG[task.status].label}
                    </button>
                </div>

                {/* Task Category */}
                <div className="col-span-4 space-y-2 md:col-span-1">
                    <label className="text-xs font-bold text-stone-500 md:hidden">분류</label>
                    <input 
                    type="text"
                    value={task.category || ''}
                    onChange={(e) => handleUpdate('category', e.target.value)}
                    className="w-full rounded-lg border border-stone-200 bg-white px-2 py-2 text-center text-xs text-stone-700 outline-none focus:border-blue-300 focus:ring-2 focus:ring-blue-100"
                    placeholder="분류"
                    />
                </div>

                {/* Task Difficulty */}
                <div className="col-span-4 flex flex-col items-start gap-2 md:col-span-1 md:items-center">
                    <label className="text-xs font-bold text-stone-500 md:hidden">난이도</label>
                    <button onClick={cycleDifficulty} className="flex gap-0.5">
                        {[1, 2, 3].map((lv) => (
                            <div 
                            key={lv} 
                            className={`w-2 h-2 rounded-full ${lv <= task.difficulty_level ? DIFFICULTY_CONFIG[task.difficulty_level].color : 'bg-gray-200'}`}
                            style={{ backgroundColor: lv <= task.difficulty_level ? '#000000' : '#e5e7eb' }}
                            />
                        ))}
                    </button>
                </div>

                {/* Times */}
                <div className="col-span-12 grid grid-cols-2 gap-2 md:col-span-2">
                    <label className="flex items-center gap-2 rounded-lg border border-stone-200 bg-stone-50 px-2 py-2">
                        <Clock3 size={14} className="text-stone-500" />
                        <input 
                        type="number"
                        value={task.estimated_minutes}
                        onChange={(e) => handleUpdate('estimated_minutes', Number(e.target.value))}
                        className="min-w-0 flex-1 border-none bg-transparent text-center text-xs text-stone-800 outline-none focus:ring-0"
                        aria-label="예상 시간"
                        />
                    </label>
                    <label className="flex items-center gap-2 rounded-lg border border-stone-200 bg-stone-50 px-2 py-2">
                        <TimerReset size={14} className="text-stone-500" />
                        <input 
                        type="number"
                        value={task.actual_minutes || 0}
                        onChange={(e) => handleUpdate('actual_minutes', Number(e.target.value))}
                        className="min-w-0 flex-1 border-none bg-transparent text-center text-xs text-stone-800 outline-none focus:ring-0"
                        aria-label="실제 시간"
                        />
                    </label>
                </div>

                {/* Due Date */}
                <div className="col-span-12 md:col-span-1">
                    <label className="flex items-center gap-2 rounded-lg border border-stone-200 bg-white px-2 py-2">
                    <CalendarDays size={14} className="text-stone-500" />
                    <input 
                    type="date"
                    value={task.due_date}
                    onChange={(e) => handleUpdate('due_date', e.target.value)}
                    className="min-w-0 flex-1 border-none bg-transparent text-xs text-stone-700 outline-none focus:ring-0"
                    />
                    </label>
                </div>

                {/* Tags */}
                <div className="col-span-12 space-y-2 md:col-span-2">
                    <div className="flex items-center gap-2 rounded-md bg-gray-50 px-2 py-1.5">
                        <Tag size={13} className="shrink-0 text-stone-500" />
                        <input
                            type="text"
                            value={task.tags.join(", ")}
                            onChange={(e) => handleUpdate("tags", normalizeTags(e.target.value))}
                            className="min-w-0 flex-1 border-none bg-transparent text-xs text-gray-700 outline-none focus:ring-0"
                            placeholder="태그 여러 개, 쉼표 구분"
                            aria-label="태그"
                        />
                    </div>
                    {task.tags.length > 0 && (
                        <div className="flex flex-wrap gap-1">
                            {task.tags.map((tag) => (
                                <span
                                    key={tag}
                                    className="inline-flex max-w-full items-center gap-1 rounded bg-stone-700 px-2 py-1 text-[11px] font-medium text-amber-50"
                                >
                                    <span className="truncate">{tag}</span>
                                    <button
                                        type="button"
                                        className="rounded hover:bg-stone-600"
                                        onClick={() => handleUpdate("tags", task.tags.filter((item) => item !== tag))}
                                        title={`${tag} 태그 삭제`}
                                    >
                                        <X size={11} />
                                    </button>
                                </span>
                            ))}
                        </div>
                    )}
                </div>

                {/* Memo link */}
                <div className="col-span-11 space-y-2 md:col-span-1">
                    <div className="flex items-center gap-2 rounded-md bg-gray-50 px-2 py-1.5">
                        <Link2 size={13} className="shrink-0 text-stone-500" />
                        <input
                            type="text"
                            value={task.memo || ""}
                            onChange={(e) => handleUpdate("memo", e.target.value)}
                            className="min-w-0 flex-1 border-none bg-transparent text-xs text-gray-700 outline-none focus:ring-0"
                            placeholder="/blog/노트명 또는 /agent"
                            aria-label="메모 링크"
                        />
                    </div>
                    <div className="flex flex-wrap gap-1">
                        <button
                            type="button"
                            className="inline-flex items-center gap-1 rounded border border-stone-300 bg-white px-2 py-1 text-[11px] text-stone-700 hover:bg-amber-100"
                            onClick={() => handleUpdate("memo", "/agent")}
                            title="에이전트 링크 넣기"
                        >
                            <Bot size={11} />
                            Agent
                        </button>
                        <button
                            type="button"
                            className="inline-flex items-center gap-1 rounded border border-stone-300 bg-white px-2 py-1 text-[11px] text-stone-700 hover:bg-amber-100"
                            onClick={() => handleUpdate("memo", "/blog")}
                            title="노트 목록 링크 넣기"
                        >
                            <FileText size={11} />
                            Notes
                        </button>
                        {getMemoHref(task.memo) && (
                            <a
                                className="inline-flex max-w-full items-center gap-1 rounded bg-stone-700 px-2 py-1 text-[11px] text-amber-50 hover:bg-stone-600"
                                href={getMemoHref(task.memo) || undefined}
                                title="메모 링크 열기"
                            >
                                <Link2 size={11} />
                                <span className="truncate">Open</span>
                            </a>
                        )}
                    </div>
                </div>
                <div className="relative col-span-1 flex justify-end" ref={menuRef}>
                    <button
                        type="button"
                        className="inline-flex h-9 w-9 items-center justify-center rounded-full text-stone-500 transition-colors hover:bg-stone-100 hover:text-stone-950 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400"
                        onClick={() => setIsMenuOpen((open) => !open)}
                        aria-label="일정 메뉴"
                    >
                        <MoreVertical size={18} />
                    </button>
                    {isMenuOpen && (
                        <div className="absolute right-0 top-10 z-20 w-28 rounded-lg border border-stone-200 bg-white p-1 shadow-xl">
                            <button
                                type="button"
                                className="flex w-full items-center rounded-md px-3 py-2 text-left text-sm font-semibold text-red-600 hover:bg-red-50"
                                onClick={() => {
                                    setIsMenuOpen(false);
                                    onDelete(task.id);
                                }}
                            >
                                삭제
                            </button>
                        </div>
                    )}
                </div>
            </div>
        );
    };

export { TaskHeader,  TaskItem};
