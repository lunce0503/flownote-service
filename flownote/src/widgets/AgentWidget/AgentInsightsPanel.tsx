import { FileText, Lightbulb, Link2 } from "lucide-react";
import { Link } from "react-router-dom";
import type { KnowledgeNote } from "./model";
import { getNotePreview } from "./model";
import type { TaskProps } from "../../entities/task";

type AgentInsightsPanelProps = {
    activeTasks: TaskProps[];
    recentNotes: KnowledgeNote[];
    knowledgeThemes: string[];
};

const AgentInsightsPanel = ({ activeTasks, recentNotes, knowledgeThemes }: AgentInsightsPanelProps) => (
    <aside className="hidden min-h-0 space-y-4 overflow-y-auto xl:block">
        <section className="rounded-lg border border-stone-200 bg-white p-4 shadow-sm">
            <h2 className="mb-3 flex items-center gap-2 text-sm font-bold">
                <Lightbulb size={17} />
                지식 인사이트
            </h2>
            <div className="space-y-3">
                <div className="rounded-md bg-amber-50 p-3">
                    <p className="text-xs font-bold text-amber-800">연결 후보</p>
                    <p className="mt-1 text-sm text-stone-700">
                        {activeTasks.length > 0 && recentNotes.length > 0
                            ? `${activeTasks[0].task_name || "첫 번째 작업"}을(를) 최근 노트 "${recentNotes[0].title}"와 연결해 검토하세요.`
                            : "노트와 작업이 쌓이면 연결 후보를 보여줍니다."}
                    </p>
                </div>
                <div className="rounded-md bg-blue-50 p-3">
                    <p className="text-xs font-bold text-blue-800">주제 태그</p>
                    <div className="mt-2 flex flex-wrap gap-2">
                        {knowledgeThemes.length > 0 ? (
                            knowledgeThemes.map((theme) => (
                                <span key={theme} className="rounded bg-white px-2 py-1 text-xs text-blue-800">
                                    {theme}
                                </span>
                            ))
                        ) : (
                            <span className="text-sm text-stone-500">작업 카테고리나 태그가 없습니다.</span>
                        )}
                    </div>
                </div>
            </div>
        </section>

        <section className="rounded-lg border border-stone-200 bg-white p-4 shadow-sm">
            <h2 className="mb-3 flex items-center gap-2 text-sm font-bold">
                <FileText size={17} />
                최근 지식
            </h2>
            <div className="space-y-2">
                {recentNotes.length > 0 ? (
                    recentNotes.map((note) => (
                        <Link
                            key={note.id}
                            to={`/blog/${encodeURIComponent(note.title)}`}
                            className="block rounded-md border border-stone-200 p-3 hover:bg-stone-50"
                        >
                            <p className="flex items-center gap-2 truncate text-sm font-semibold">
                                <Link2 size={13} />
                                <span className="truncate">{note.title}</span>
                            </p>
                            <p className="mt-1 line-clamp-2 text-xs text-stone-500">{getNotePreview(note)}</p>
                        </Link>
                    ))
                ) : (
                    <p className="rounded-md bg-stone-50 p-4 text-sm text-stone-500">작성된 노트가 없습니다.</p>
                )}
            </div>
        </section>
    </aside>
);

export default AgentInsightsPanel;
