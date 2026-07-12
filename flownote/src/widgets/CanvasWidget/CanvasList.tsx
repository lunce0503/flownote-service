import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Loader2, Plus, Trash2 } from "lucide-react";
import { createCanvasDocument, deleteCanvasDocument, getCanvasDocuments } from "@/entities/canvas";
import type { CanvasDocumentSummary } from "@/entities/canvas";

// 그림판 목록 페이지(/canvas). 카드를 누르면 /canvas/:canvasId 편집기로 이동한다.
// 멀티 캔버스를 URL(id)로 구분하기 위한 진입점.
const formatDate = (value?: string) => {
    if (!value) return "";
    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) return "";
    return new Intl.DateTimeFormat("ko-KR", { dateStyle: "medium", timeStyle: "short" }).format(parsed);
};

const sortByUpdated = (documents: CanvasDocumentSummary[]) =>
    [...documents].sort((a, b) => (b.updated_at ?? "").localeCompare(a.updated_at ?? ""));

export default function CanvasList() {
    const navigate = useNavigate();
    const [documents, setDocuments] = useState<CanvasDocumentSummary[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [isCreating, setIsCreating] = useState(false);
    const [confirmingDeleteId, setConfirmingDeleteId] = useState<string | null>(null);

    useEffect(() => {
        let active = true;
        (async () => {
            try {
                const docs = await getCanvasDocuments();
                if (active) setDocuments(sortByUpdated(docs));
            } catch (loadError) {
                console.error("Failed to load canvas list:", loadError);
                if (active) setError("캔버스 목록을 불러오지 못했습니다.");
            } finally {
                if (active) setIsLoading(false);
            }
        })();
        return () => {
            active = false;
        };
    }, []);

    const openCanvas = (canvasId: string) => navigate(`/canvas/${canvasId}`);

    const handleCreate = async () => {
        setIsCreating(true);
        setError(null);
        try {
            const created = await createCanvasDocument("새 캔버스");
            navigate(`/canvas/${created.id}`);
        } catch (createError) {
            console.error("Failed to create canvas:", createError);
            setError("캔버스를 만들지 못했습니다.");
            setIsCreating(false);
        }
    };

    const handleDelete = async (canvasId: string) => {
        try {
            await deleteCanvasDocument(canvasId);
            setDocuments((current) => current.filter((document) => document.id !== canvasId));
            setConfirmingDeleteId(null);
        } catch (deleteError) {
            console.error("Failed to delete canvas:", deleteError);
            setError("캔버스를 삭제하지 못했습니다.");
        }
    };

    return (
        <div className="min-h-[calc(100vh-56px)] bg-stone-50 px-4 py-6">
            <div className="mx-auto max-w-5xl">
                <header className="mb-5 flex flex-wrap items-end justify-between gap-3">
                    <div>
                        <p className="text-xs font-bold uppercase tracking-wide text-amber-700">Canvas</p>
                        <h1 className="text-2xl font-black text-stone-950">그림판 목록</h1>
                        <p className="text-sm text-stone-500">캔버스를 선택해 열거나 새로 만들 수 있습니다.</p>
                    </div>
                    <button
                        type="button"
                        onClick={() => void handleCreate()}
                        disabled={isCreating}
                        className="inline-flex items-center gap-2 rounded-xl bg-stone-900 px-4 py-2 text-sm font-bold text-white transition hover:bg-stone-700 disabled:opacity-60"
                    >
                        {isCreating ? <Loader2 size={16} className="animate-spin" /> : <Plus size={16} />}
                        새 캔버스
                    </button>
                </header>

                {error && (
                    <div className="mb-4 rounded-lg bg-red-50 px-4 py-2 text-sm font-semibold text-red-700" role="alert">
                        {error}
                    </div>
                )}

                {isLoading ? (
                    <div className="flex items-center justify-center gap-2 rounded-2xl border border-stone-200 bg-white py-16 text-sm font-semibold text-stone-400">
                        <Loader2 size={18} className="animate-spin" /> 캔버스를 불러오는 중...
                    </div>
                ) : documents.length === 0 ? (
                    <div className="rounded-2xl border border-dashed border-stone-300 bg-white py-16 text-center">
                        <p className="text-sm font-semibold text-stone-500">아직 만든 캔버스가 없습니다.</p>
                        <button
                            type="button"
                            onClick={() => void handleCreate()}
                            className="mt-3 inline-flex items-center gap-2 rounded-xl bg-amber-600 px-4 py-2 text-sm font-bold text-white hover:bg-amber-500"
                        >
                            <Plus size={16} /> 첫 캔버스 만들기
                        </button>
                    </div>
                ) : (
                    <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                        {documents.map((document) => (
                            <li
                                key={document.id}
                                className="group relative flex flex-col rounded-2xl border border-stone-200 bg-white shadow-sm transition hover:border-amber-400 hover:shadow-md"
                            >
                                <button
                                    type="button"
                                    onClick={() => openCanvas(document.id)}
                                    className="flex flex-1 flex-col items-start gap-6 p-4 text-left"
                                >
                                    <span className="line-clamp-2 text-base font-black text-stone-900">{document.title || "제목 없음"}</span>
                                    <span className="text-xs font-semibold text-stone-400">{formatDate(document.updated_at) || "방금"}</span>
                                </button>
                                <div className="flex items-center justify-end border-t border-stone-100 px-2 py-1.5">
                                    {confirmingDeleteId === document.id ? (
                                        <div className="flex items-center gap-1">
                                            <button
                                                type="button"
                                                onClick={() => void handleDelete(document.id)}
                                                className="rounded-md bg-red-600 px-2 py-1 text-xs font-bold text-white hover:bg-red-700"
                                            >
                                                삭제
                                            </button>
                                            <button
                                                type="button"
                                                onClick={() => setConfirmingDeleteId(null)}
                                                className="rounded-md px-2 py-1 text-xs font-bold text-stone-500 hover:bg-stone-100"
                                            >
                                                취소
                                            </button>
                                        </div>
                                    ) : (
                                        <button
                                            type="button"
                                            onClick={() => setConfirmingDeleteId(document.id)}
                                            className="inline-flex h-7 w-7 items-center justify-center rounded-md text-stone-400 hover:bg-red-50 hover:text-red-600"
                                            title="캔버스 삭제"
                                            aria-label={`${document.title} 삭제`}
                                        >
                                            <Trash2 size={15} />
                                        </button>
                                    )}
                                </div>
                            </li>
                        ))}
                    </ul>
                )}
            </div>
        </div>
    );
}
