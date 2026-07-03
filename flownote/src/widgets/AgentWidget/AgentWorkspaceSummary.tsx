import { Bot, CheckCircle2, FileText, Target } from "lucide-react";
import type { WorkspaceSnapshot } from "./model";

type AgentWorkspaceSummaryProps = {
    workspace: WorkspaceSnapshot;
    activeTaskCount: number;
    completedTaskCount: number;
    error: string | null;
};

const AgentWorkspaceSummary = ({
    workspace,
    activeTaskCount,
    completedTaskCount,
    error,
}: AgentWorkspaceSummaryProps) => (
    <section className="rounded-lg border border-stone-200 bg-white p-3 shadow-sm md:p-4">
        <div className="mb-3 flex items-center justify-between gap-3 md:mb-4">
            <div>
                <p className="hidden text-xs font-bold uppercase text-amber-700 md:block">Agentic Knowledge</p>
                <h1 className="mt-1 text-lg font-bold text-stone-950 md:text-xl">지식관리</h1>
            </div>
            <Bot className="shrink-0 text-stone-700" size={28} />
        </div>
        <div className="grid grid-cols-3 gap-2">
            <div className="rounded-md bg-stone-100 p-2 md:p-3">
                <FileText size={18} className="mb-1 text-amber-700 md:mb-2" />
                <p className="text-lg font-bold">{workspace.notes.length}</p>
                <p className="hidden text-xs text-stone-500 sm:block">노트</p>
            </div>
            <div className="rounded-md bg-stone-100 p-2 md:p-3">
                <Target size={18} className="mb-1 text-blue-700 md:mb-2" />
                <p className="text-lg font-bold">{activeTaskCount}</p>
                <p className="hidden text-xs text-stone-500 sm:block">진행</p>
            </div>
            <div className="rounded-md bg-stone-100 p-2 md:p-3">
                <CheckCircle2 size={18} className="mb-1 text-emerald-700 md:mb-2" />
                <p className="text-lg font-bold">{completedTaskCount}</p>
                <p className="hidden text-xs text-stone-500 sm:block">완료</p>
            </div>
        </div>
        {error && <p className="mt-3 rounded-md bg-red-50 p-3 text-sm text-red-700">{error}</p>}
    </section>
);

export default AgentWorkspaceSummary;
