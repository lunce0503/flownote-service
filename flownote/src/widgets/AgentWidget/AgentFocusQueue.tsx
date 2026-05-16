import { Clock3, FolderKanban, RefreshCw } from "lucide-react";
import type { TaskProps } from "../../entities/task";
import { formatDueDate, statusLabel } from "./model";

type AgentFocusQueueProps = {
    tasks: TaskProps[];
    isLoading: boolean;
    onRefresh: () => void;
};

const AgentFocusQueue = ({ tasks, isLoading, onRefresh }: AgentFocusQueueProps) => (
    <section className="hidden rounded-lg border border-stone-200 bg-white p-4 shadow-sm md:block">
        <div className="mb-3 flex items-center justify-between">
            <h2 className="flex items-center gap-2 text-sm font-bold">
                <FolderKanban size={17} />
                집중 큐
            </h2>
            <button
                className="inline-flex h-8 w-8 items-center justify-center rounded-md text-stone-600 hover:bg-stone-100 disabled:cursor-not-allowed disabled:text-stone-300"
                onClick={onRefresh}
                disabled={isLoading}
                title="워크스페이스 새로고침"
            >
                <RefreshCw size={16} className={isLoading ? "animate-spin" : ""} />
            </button>
        </div>
        <div className="space-y-2">
            {tasks.length > 0 ? (
                tasks.map((task) => (
                    <div key={task.id} className="rounded-md border border-stone-200 p-3">
                        <div className="mb-2 flex items-start justify-between gap-2">
                            <p className="line-clamp-1 text-sm font-semibold lg:line-clamp-2">{task.task_name || "이름 없는 작업"}</p>
                            <span className="shrink-0 rounded bg-stone-100 px-2 py-1 text-[11px] text-stone-600">
                                {statusLabel[task.status]}
                            </span>
                        </div>
                        <div className="flex items-center gap-2 text-xs text-stone-500">
                            <Clock3 size={13} />
                            <span>{formatDueDate(task.due_date)}</span>
                            <span className="hidden lg:inline">{task.estimated_minutes}분</span>
                        </div>
                    </div>
                ))
            ) : (
                <p className="rounded-md bg-stone-50 p-4 text-sm text-stone-500">진행 중인 작업이 없습니다.</p>
            )}
        </div>
    </section>
);

export default AgentFocusQueue;
