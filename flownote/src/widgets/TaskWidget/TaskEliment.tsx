import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import {
    Bot,
    CalendarDays,
    Check,
    CheckCircle2,
    Circle,
    Clock3,
    Edit3,
    Link2,
    MoreVertical,
    PlayCircle,
    Plus,
    Tag,
    TimerReset,
    X,
} from "lucide-react";
import type { TaskProps } from "../../entities/task";

// --- Constants & Styles ---
const STATUS_CONFIG = {
    TODO: { label: '할 일', color: 'bg-slate-100 text-slate-700 ring-slate-200', Icon: Circle },
    DOING: { label: '진행 중', color: 'bg-amber-100 text-amber-800 ring-amber-200', Icon: PlayCircle },
    DONE: { label: '완료', color: 'bg-emerald-100 text-emerald-800 ring-emerald-200', Icon: CheckCircle2 },
};

const DIFFICULTY_CONFIG = {
    1: { label: '쉬움', color: 'bg-green-200' },
    2: { label: '보통', color: 'bg-yellow-200' },
    3: { label: '어려움', color: 'bg-red-200' },
};

// --- Components ---
const TaskHeader = () => (
  <div className="hidden grid-cols-12 gap-3 rounded-xl border border-stone-200 bg-stone-100 px-4 py-3 text-xs font-bold uppercase tracking-wide text-stone-500 md:grid">
    <div className="col-span-4">일정</div>
    <div className="col-span-1 text-center">상태</div>
    <div className="col-span-6 text-center">태그 / 링크</div>
    <div className="col-span-1 text-right">메뉴</div>
  </div>
);

type ParsedTaskLink =
    | { type: "note"; value: string; folderName: string; noteName: string; label: string; href: string }
    | { type: "agent"; value: string; agentName: string; label: string; href: string }
    | { type: "raw"; value: string; label: string; href: string | null };

const uniqueTextValues = (values: string[]) => Array.from(new Set(values.map((value) => value.trim()).filter(Boolean)));

const getTaskTags = (task: TaskProps) => uniqueTextValues([
    task.category ?? "",
    ...(Array.isArray(task.tags) ? task.tags : []),
]);

const encodeTaskLinkPart = (value: string) => encodeURIComponent(value.trim());

const createNoteLinkValue = (folderName: string, noteName: string) => (
    `note:${encodeTaskLinkPart(folderName)}:${encodeTaskLinkPart(noteName)}`
);

const createAgentLinkValue = (agentName: string) => `agent:${encodeTaskLinkPart(agentName)}`;

const decodeTaskLinkPart = (value: string) => {
    try {
        return decodeURIComponent(value);
    } catch {
        return value;
    }
};

const getRawHref = (value: string) => {
    if (value.startsWith("/")) return value;

    try {
        return new URL(value).href;
    } catch {
        return null;
    }
};

const parseTaskLink = (value: string): ParsedTaskLink => {
    const trimmed = value.trim();

    if (trimmed.startsWith("note:")) {
        const [, folder = "", note = ""] = trimmed.split(":");
        const folderName = decodeTaskLinkPart(folder);
        const noteName = decodeTaskLinkPart(note);
        return {
            type: "note",
            value: trimmed,
            folderName,
            noteName,
            label: [folderName, noteName].filter(Boolean).join("-") || "노트",
            href: noteName ? `/blog/${encodeURIComponent(noteName)}` : "/blog",
        };
    }

    if (trimmed.startsWith("agent:")) {
        const agentName = decodeTaskLinkPart(trimmed.slice("agent:".length)) || "에이전트";
        return {
            type: "agent",
            value: trimmed,
            agentName,
            label: agentName,
            href: "/agent",
        };
    }

    if (trimmed === "/agent") {
        return { type: "agent", value: trimmed, agentName: "에이전트", label: "에이전트", href: "/agent" };
    }

    return {
        type: "raw",
        value: trimmed,
        label: trimmed.replace(/^https?:\/\//, "") || "링크",
        href: getRawHref(trimmed),
    };
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
        const [tagDraft, setTagDraft] = useState("");
        const [noteFolderDraft, setNoteFolderDraft] = useState("");
        const [noteNameDraft, setNoteNameDraft] = useState("");
        const [agentNameDraft, setAgentNameDraft] = useState("");
        const [editingLinkIndex, setEditingLinkIndex] = useState<number | null>(null);
        const [editingNoteFolder, setEditingNoteFolder] = useState("");
        const [editingNoteName, setEditingNoteName] = useState("");
        const [editingAgentName, setEditingAgentName] = useState("");
        const [editingRawLink, setEditingRawLink] = useState("");
        const menuRef = useRef<HTMLDivElement>(null);
        const tags = getTaskTags(task);
        const links = Array.isArray(task.links) ? task.links : [];
        const parsedLinks = links.map(parseTaskLink);
        const StatusIcon = STATUS_CONFIG[task.status].Icon;

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

        const addTags = (value: string) => {
            const nextTags = uniqueTextValues([
                ...tags,
                ...value.split(",").map((tag) => tag.trim()),
            ]);
            onChange({ ...task, category: "", tags: nextTags, update_at: new Date() });
            setTagDraft("");
        };

        const removeTag = (tag: string) => {
            onChange({
                ...task,
                category: task.category === tag ? "" : task.category,
                tags: tags.filter((item) => item !== tag),
                update_at: new Date(),
            });
        };

        const updateLinks = (nextLinks: string[]) => {
            handleUpdate("links", uniqueTextValues(nextLinks));
        };

        const addNoteLink = () => {
            const folderName = noteFolderDraft.trim();
            const noteName = noteNameDraft.trim();
            if (!folderName || !noteName) return;
            updateLinks([...links, createNoteLinkValue(folderName, noteName)]);
            setNoteFolderDraft("");
            setNoteNameDraft("");
        };

        const addAgentLink = () => {
            const agentName = agentNameDraft.trim();
            if (!agentName) return;
            updateLinks([...links, createAgentLinkValue(agentName)]);
            setAgentNameDraft("");
        };

        const removeLink = (index: number) => {
            updateLinks(links.filter((_, linkIndex) => linkIndex !== index));
            setEditingLinkIndex(null);
        };

        const beginEditLink = (index: number, link: ParsedTaskLink) => {
            setEditingLinkIndex(index);
            if (link.type === "note") {
                setEditingNoteFolder(link.folderName);
                setEditingNoteName(link.noteName);
            } else if (link.type === "agent") {
                setEditingAgentName(link.agentName);
            } else {
                setEditingRawLink(link.value);
            }
        };

        const saveLinkEdit = (index: number, link: ParsedTaskLink) => {
            const nextLinks = [...links];
            if (link.type === "note") {
                const folderName = editingNoteFolder.trim();
                const noteName = editingNoteName.trim();
                if (!folderName || !noteName) return;
                nextLinks[index] = createNoteLinkValue(folderName, noteName);
            } else if (link.type === "agent") {
                const agentName = editingAgentName.trim();
                if (!agentName) return;
                nextLinks[index] = createAgentLinkValue(agentName);
            } else {
                const rawLink = editingRawLink.trim();
                if (!rawLink) return;
                nextLinks[index] = rawLink;
            }
            updateLinks(nextLinks);
            setEditingLinkIndex(null);
        };

        return (
            <div className="grid grid-cols-12 gap-3 rounded-xl border border-stone-200 bg-white px-4 py-4 text-stone-900 shadow-sm transition-all hover:border-stone-300 hover:shadow-md">
                {/* Task Name */}
                <div className="col-span-10 space-y-2 md:col-span-4">
                    <label className="text-xs font-bold text-stone-500 md:hidden">일정</label>
                    <input type="text"
                        value={task.task_name}
                        onChange={(e) => handleUpdate('task_name', e.target.value)}
                        className="w-full rounded-lg border border-transparent bg-stone-50 px-3 py-2 text-sm font-semibold text-stone-900 outline-none transition-colors focus:border-blue-300 focus:bg-white focus:ring-2 focus:ring-blue-100"
                        placeholder="일정명을 입력하세요"
                    />
                </div>

                {/* Task Status */}
                <div className="col-span-2 flex flex-col items-end gap-2 md:col-span-1 md:items-center">
                    <label className="text-xs font-bold text-stone-500 md:hidden">상태</label>
                    <button 
                        type="button"
                        onClick={cycleStatus}
                        className={`${STATUS_CONFIG[task.status].color} inline-flex h-10 w-10 items-center justify-center rounded-full ring-1 transition-all hover:scale-105`}
                        title={STATUS_CONFIG[task.status].label}
                        aria-label={`상태: ${STATUS_CONFIG[task.status].label}`}
                    >
                        <StatusIcon size={18} />
                    </button>
                </div>

                {/* Tags */}
                <div className="col-span-12 space-y-2 md:col-span-3">
                    <div className="flex items-center gap-2 rounded-md bg-gray-50 px-2 py-1.5">
                        <Tag size={13} className="shrink-0 text-stone-500" />
                        <input
                            type="text"
                            value={tagDraft}
                            onChange={(event) => setTagDraft(event.target.value)}
                            onKeyDown={(event) => {
                                if (event.key === "Enter") {
                                    event.preventDefault();
                                    addTags(tagDraft);
                                }
                            }}
                            className="min-w-0 flex-1 border-none bg-transparent text-xs text-gray-700 outline-none focus:ring-0"
                            placeholder="태그 입력"
                            aria-label="추가할 태그"
                        />
                        <button
                            type="button"
                            className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-stone-900 text-white disabled:bg-stone-300"
                            onClick={() => addTags(tagDraft)}
                            disabled={!tagDraft.trim()}
                            title="태그 추가"
                        >
                            <Plus size={13} />
                        </button>
                    </div>
                    {tags.length > 0 && (
                        <div className="flex flex-wrap gap-1">
                            {tags.map((tag) => (
                                <span
                                    key={tag}
                                    className="inline-flex max-w-full items-center gap-1 rounded bg-stone-700 px-2 py-1 text-[11px] font-medium text-amber-50"
                                >
                                    <span className="truncate">{tag}</span>
                                    <button
                                        type="button"
                                        className="rounded hover:bg-stone-600"
                                        onClick={() => removeTag(tag)}
                                        title={`${tag} 태그 삭제`}
                                    >
                                        <X size={11} />
                                    </button>
                                </span>
                            ))}
                        </div>
                    )}
                </div>

                {/* Links */}
                <div className="col-span-12 space-y-2 md:col-span-3">
                    <div className="grid gap-1 rounded-md bg-gray-50 p-2">
                        <div className="grid gap-1 sm:grid-cols-[minmax(80px,1fr)_minmax(100px,1fr)_auto]">
                            <label className="flex items-center gap-1 rounded-md bg-white px-2 py-1.5 ring-1 ring-stone-200">
                                <Link2 size={13} className="shrink-0 text-stone-500" />
                                <input
                                    type="text"
                                    value={noteFolderDraft}
                                    onChange={(event) => setNoteFolderDraft(event.target.value)}
                                    className="min-w-0 flex-1 border-none bg-transparent text-xs text-gray-700 outline-none focus:ring-0"
                                    placeholder="폴더명"
                                    aria-label="노트 폴더명"
                                />
                            </label>
                            <input
                                type="text"
                                value={noteNameDraft}
                                onChange={(event) => setNoteNameDraft(event.target.value)}
                                onKeyDown={(event) => {
                                    if (event.key === "Enter") {
                                        event.preventDefault();
                                        addNoteLink();
                                    }
                                }}
                                className="min-w-0 rounded-md border-none bg-white px-2 py-1.5 text-xs text-gray-700 outline-none ring-1 ring-stone-200 focus:ring-blue-200"
                                placeholder="노트이름"
                                aria-label="노트 이름"
                            />
                            <button
                                type="button"
                                className="inline-flex h-8 items-center justify-center gap-1 rounded-md bg-stone-900 px-2 text-[11px] font-bold text-white disabled:bg-stone-300"
                                onClick={addNoteLink}
                                disabled={!noteFolderDraft.trim() || !noteNameDraft.trim()}
                                title="노트 버튼 추가"
                            >
                                <Plus size={12} />
                                노트
                            </button>
                        </div>
                    </div>
                    <div className="flex items-center gap-2 rounded-md bg-gray-50 px-2 py-1.5">
                        <Link2 size={13} className="shrink-0 text-stone-500" />
                        <input
                            type="text"
                            value={agentNameDraft}
                            onChange={(event) => setAgentNameDraft(event.target.value)}
                            onKeyDown={(event) => {
                                if (event.key === "Enter") {
                                    event.preventDefault();
                                    addAgentLink();
                                }
                            }}
                            className="min-w-0 flex-1 border-none bg-transparent text-xs text-gray-700 outline-none focus:ring-0"
                            placeholder="에이전트 버튼 이름"
                            aria-label="에이전트 버튼 이름"
                        />
                        <button
                            type="button"
                            className="inline-flex h-7 items-center justify-center gap-1 rounded-md border border-stone-300 bg-white px-2 text-[11px] font-bold text-stone-700 disabled:text-stone-300"
                            onClick={addAgentLink}
                            disabled={!agentNameDraft.trim()}
                            title="에이전트 버튼 추가"
                        >
                            <Bot size={12} />
                            추가
                        </button>
                    </div>
                    <div className="flex flex-wrap gap-1">
                        {parsedLinks.map((link, index) => (
                            <span key={`${link.value}-${index}`} className="inline-flex max-w-full items-center gap-1 rounded bg-white px-2 py-1 text-[11px] text-stone-700 ring-1 ring-stone-200">
                                {editingLinkIndex === index ? (
                                    <>
                                        {link.type === "note" ? (
                                            <>
                                                <input
                                                    value={editingNoteFolder}
                                                    onChange={(event) => setEditingNoteFolder(event.target.value)}
                                                    className="w-20 rounded border border-stone-200 px-1 py-0.5 outline-none"
                                                    aria-label="수정할 노트 폴더명"
                                                />
                                                <input
                                                    value={editingNoteName}
                                                    onChange={(event) => setEditingNoteName(event.target.value)}
                                                    className="w-24 rounded border border-stone-200 px-1 py-0.5 outline-none"
                                                    aria-label="수정할 노트 이름"
                                                />
                                            </>
                                        ) : link.type === "agent" ? (
                                            <input
                                                value={editingAgentName}
                                                onChange={(event) => setEditingAgentName(event.target.value)}
                                                className="w-28 rounded border border-stone-200 px-1 py-0.5 outline-none"
                                                aria-label="수정할 에이전트 이름"
                                            />
                                        ) : (
                                            <input
                                                value={editingRawLink}
                                                onChange={(event) => setEditingRawLink(event.target.value)}
                                                className="w-36 rounded border border-stone-200 px-1 py-0.5 outline-none"
                                                aria-label="수정할 링크"
                                            />
                                        )}
                                        <button type="button" className="rounded hover:bg-stone-100" title="수정 저장" onClick={() => saveLinkEdit(index, link)}>
                                            <Check size={11} />
                                        </button>
                                        <button type="button" className="rounded hover:bg-stone-100" title="수정 취소" onClick={() => setEditingLinkIndex(null)}>
                                            <X size={11} />
                                        </button>
                                    </>
                                ) : (
                                    <>
                                        {link.type === "agent" ? <Bot size={11} className="shrink-0" /> : <Link2 size={11} className="shrink-0" />}
                                        {link.href?.startsWith("/") ? (
                                            <Link className="max-w-32 truncate font-semibold hover:text-amber-700" to={link.href} title={link.label}>
                                                {link.label}
                                            </Link>
                                        ) : link.href ? (
                                            <a className="max-w-32 truncate font-semibold hover:text-amber-700" href={link.href} title={link.label}>
                                                {link.label}
                                            </a>
                                        ) : (
                                            <span className="max-w-32 truncate font-semibold" title={link.label}>{link.label}</span>
                                        )}
                                        <button type="button" className="rounded hover:bg-stone-100" title="버튼 수정" onClick={() => beginEditLink(index, link)}>
                                            <Edit3 size={11} />
                                        </button>
                                        <button type="button" className="rounded hover:bg-stone-100" title="버튼 삭제" onClick={() => removeLink(index)}>
                                            <X size={11} />
                                        </button>
                                    </>
                                )}
                            </span>
                        ))}
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
                        <div className="absolute right-0 top-10 z-20 w-80 rounded-xl border border-stone-200 bg-white p-3 shadow-xl">
                            <div className="space-y-3">
                                <div>
                                    <div className="mb-2 text-xs font-bold text-stone-500">난이도</div>
                                    <div className="grid grid-cols-3 gap-1">
                                        {([1, 2, 3] as TaskProps["difficulty_level"][]).map((level) => (
                                            <button
                                                key={level}
                                                type="button"
                                                onClick={() => handleUpdate("difficulty_level", level)}
                                                className={`inline-flex items-center justify-center gap-1 rounded-lg border px-2 py-2 text-xs font-bold ${
                                                    task.difficulty_level === level
                                                        ? "border-stone-900 bg-stone-900 text-white"
                                                        : "border-stone-200 bg-white text-stone-600 hover:bg-stone-50"
                                                }`}
                                            >
                                                {Array.from({ length: level }).map((_, index) => (
                                                    <span key={index} className="h-1.5 w-1.5 rounded-full bg-current" />
                                                ))}
                                                {DIFFICULTY_CONFIG[level].label}
                                            </button>
                                        ))}
                                    </div>
                                </div>
                                <div className="grid grid-cols-2 gap-2">
                                    <label className="space-y-1">
                                        <span className="flex items-center gap-1 text-xs font-bold text-stone-500">
                                            <Clock3 size={13} />
                                            예상 시간
                                        </span>
                                        <input
                                            type="number"
                                            min={0}
                                            value={task.estimated_minutes}
                                            onChange={(event) => handleUpdate("estimated_minutes", Number(event.target.value))}
                                            className="w-full rounded-lg border border-stone-200 px-3 py-2 text-sm outline-none focus:border-blue-300"
                                        />
                                    </label>
                                    <label className="space-y-1">
                                        <span className="flex items-center gap-1 text-xs font-bold text-stone-500">
                                            <TimerReset size={13} />
                                            실제 시간
                                        </span>
                                        <input
                                            type="number"
                                            min={0}
                                            value={task.actual_minutes || 0}
                                            onChange={(event) => handleUpdate("actual_minutes", Number(event.target.value))}
                                            className="w-full rounded-lg border border-stone-200 px-3 py-2 text-sm outline-none focus:border-blue-300"
                                        />
                                    </label>
                                </div>
                                <label className="space-y-1">
                                    <span className="flex items-center gap-1 text-xs font-bold text-stone-500">
                                        <CalendarDays size={13} />
                                        마감
                                    </span>
                                    <input
                                        type="date"
                                        value={task.due_date}
                                        onChange={(event) => handleUpdate("due_date", event.target.value)}
                                        className="w-full rounded-lg border border-stone-200 px-3 py-2 text-sm outline-none focus:border-blue-300"
                                    />
                                </label>
                            </div>
                            <button
                                type="button"
                                className="mt-3 flex w-full items-center rounded-md px-3 py-2 text-left text-sm font-semibold text-red-600 hover:bg-red-50"
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
