import { useCallback, useEffect, useMemo, useState, type DragEvent } from "react";
import { useNavigate } from "react-router-dom";
import { Check, Folder, Loader2, Pencil, Plus, Trash2, X } from "lucide-react";
import {
    addCanvasToFolder, createCanvasDocument, createCanvasFolder, deleteCanvasDocument,
    deleteCanvasFolder, getCanvasDocuments, getCanvasFolders, removeCanvasFromFolder,
    updateCanvasDocument, updateCanvasFolder, type CanvasDocumentSummary, type CanvasFolder,
} from "@/entities/canvas";
import {
    CANVAS_COLLAPSED_FOLDER_IDS_STORAGE_KEY, buildCanvasFolderIdByCanvasId,
    getUnfiledCanvases, groupCanvasFoldersByCategory,
} from "@/features/canvas";
import { getRecentLibraryItems, sortLibraryCategoryEntries, sortLibraryItemsByRecent } from "@/shared/lib/librarySorting";
import { useLocalStorageStringSet } from "@/shared/lib/useLocalStorageStringSet";
import { subscribeSyncEvents } from "@/shared/lib/sync";

type FolderForm = { category: string; name: string };
const EMPTY_FOLDER_FORM: FolderForm = { category: "", name: "" };
const OPTIMISTIC_CANVAS_PREFIX = "optimistic-canvas-";
const OPTIMISTIC_FOLDER_PREFIX = "optimistic-folder-";

const createOptimisticId = (prefix: string) => `${prefix}${crypto.randomUUID()}`;
const isOptimisticCanvas = (canvasId: string) => canvasId.startsWith(OPTIMISTIC_CANVAS_PREFIX);
const isOptimisticFolder = (folderId: string) => folderId.startsWith(OPTIMISTIC_FOLDER_PREFIX);

const formatDate = (value?: string) => {
    if (!value) return "방금";
    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) return "방금";
    return new Intl.DateTimeFormat("ko-KR", { dateStyle: "medium", timeStyle: "short" }).format(parsed);
};

export default function CanvasList() {
    const navigate = useNavigate();
    const [documents, setDocuments] = useState<CanvasDocumentSummary[]>([]);
    const [folders, setFolders] = useState<CanvasFolder[]>([]);
    const [folderForm, setFolderForm] = useState<FolderForm>(EMPTY_FOLDER_FORM);
    const [editingFolderId, setEditingFolderId] = useState<string | null>(null);
    const [editingFolderForm, setEditingFolderForm] = useState<FolderForm>(EMPTY_FOLDER_FORM);
    const [editingCanvasId, setEditingCanvasId] = useState<string | null>(null);
    const [editingCanvasTitle, setEditingCanvasTitle] = useState("");
    const [confirmingDeleteId, setConfirmingDeleteId] = useState<string | null>(null);
    const [collapsedFolderIds, setCollapsedFolderIds] = useLocalStorageStringSet(CANVAS_COLLAPSED_FOLDER_IDS_STORAGE_KEY);
    const [isLoading, setIsLoading] = useState(true);
    const [isCreating, setIsCreating] = useState(false);
    const [isCreatingFolder, setIsCreatingFolder] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const loadLibrary = useCallback(async () => {
        setError(null);
        try {
            const [loadedDocuments, loadedFolders] = await Promise.all([getCanvasDocuments(), getCanvasFolders()]);
            setDocuments((current) => [
                ...current.filter((document) => isOptimisticCanvas(document.id)),
                ...loadedDocuments,
            ]);
            setFolders((current) => {
                const optimisticFolders = current.filter((folder) => isOptimisticFolder(folder.id));
                const loadedWithPendingDocuments = loadedFolders.map((folder) => {
                    const currentFolder = current.find((candidate) => candidate.id === folder.id);
                    const pendingCanvasIds = currentFolder?.canvasIds.filter(isOptimisticCanvas) ?? [];
                    return {
                        ...folder,
                        canvasIds: [...pendingCanvasIds, ...folder.canvasIds],
                    };
                });
                return [...optimisticFolders, ...loadedWithPendingDocuments];
            });
        } catch (loadError) {
            console.error("Failed to load canvas library:", loadError);
            setError("캔버스 목록을 불러오지 못했습니다.");
        } finally {
            setIsLoading(false);
        }
    }, []);

    useEffect(() => {
        const timer = window.setTimeout(() => void loadLibrary(), 0);
        return () => window.clearTimeout(timer);
    }, [loadLibrary]);
    useEffect(() => subscribeSyncEvents((event) => {
        if (event.resource === "canvas" || event.resource === "all") void loadLibrary();
    }), [loadLibrary]);

    const folderIdByCanvasId = useMemo(() => buildCanvasFolderIdByCanvasId(folders), [folders]);
    const unfiledCanvases = useMemo(() => sortLibraryItemsByRecent(
        getUnfiledCanvases(documents, folderIdByCanvasId), (document) => document.title,
    ), [documents, folderIdByCanvasId]);
    const recentCanvases = useMemo(() => getRecentLibraryItems(documents, (document) => document.title), [documents]);
    const folderCategoryEntries = useMemo(() => sortLibraryCategoryEntries(
        groupCanvasFoldersByCategory(folders), (folder) => folder.name,
    ), [folders]);

    const replaceFolder = (updated: CanvasFolder) => {
        setFolders((current) => current.map((folder) => (folder.id === updated.id ? updated : folder)));
    };

    const handleCreateCanvas = async (folderId?: string) => {
        if (folderId && isOptimisticFolder(folderId)) return;
        const temporaryId = createOptimisticId(OPTIMISTIC_CANVAS_PREFIX);
        const now = new Date().toISOString();
        const optimisticDocument: CanvasDocumentSummary = {
            id: temporaryId,
            title: "새 캔버스",
            created_at: now,
            updated_at: now,
        };

        setIsCreating(true);
        setError(null);
        setDocuments((current) => [optimisticDocument, ...current]);
        if (folderId) {
            setFolders((current) => current.map((folder) => (
                folder.id === folderId
                    ? { ...folder, canvasIds: [temporaryId, ...folder.canvasIds] }
                    : folder
            )));
        }

        try {
            const created = await createCanvasDocument("새 캔버스");
            setDocuments((current) => [
                created,
                ...current.filter((document) => document.id !== temporaryId && document.id !== created.id),
            ]);
            setFolders((current) => current.map((folder) => ({
                ...folder,
                canvasIds: folder.canvasIds.map((canvasId) => canvasId === temporaryId ? created.id : canvasId),
            })));
            if (folderId) {
                try {
                    const updated = await addCanvasToFolder(folderId, created.id);
                    setFolders((current) => current.map((folder) => (folder.id === updated.id ? updated : {
                        ...folder, canvasIds: folder.canvasIds.filter((id) => id !== created.id),
                    })));
                } catch (folderError) {
                    console.error("Failed to add the new canvas to its folder:", folderError);
                    setFolders((current) => current.map((folder) => ({
                        ...folder,
                        canvasIds: folder.canvasIds.filter((id) => id !== created.id),
                    })));
                    setError("캔버스는 만들었지만 폴더에 넣지 못했습니다.");
                }
            }
            navigate(`/canvas/${created.id}`);
        } catch (createError) {
            console.error("Failed to create canvas:", createError);
            setDocuments((current) => current.filter((document) => document.id !== temporaryId));
            setFolders((current) => current.map((folder) => ({
                ...folder,
                canvasIds: folder.canvasIds.filter((canvasId) => canvasId !== temporaryId),
            })));
            setError("캔버스를 만들지 못했습니다.");
        } finally {
            setIsCreating(false);
        }
    };

    const handleCreateFolder = async () => {
        if (!folderForm.name.trim()) return;
        const submittedForm = {
            category: folderForm.category.trim(),
            name: folderForm.name.trim(),
        };
        const temporaryId = createOptimisticId(OPTIMISTIC_FOLDER_PREFIX);
        const now = new Date().toISOString();
        const optimisticFolder: CanvasFolder = {
            id: temporaryId,
            category: submittedForm.category || "기타",
            name: submittedForm.name,
            canvasIds: [],
            created_at: now,
            updated_at: now,
        };

        setIsCreatingFolder(true);
        setError(null);
        setFolders((current) => [optimisticFolder, ...current]);
        setFolderForm(EMPTY_FOLDER_FORM);
        try {
            const created = await createCanvasFolder(submittedForm);
            setFolders((current) => [
                created,
                ...current.filter((folder) => folder.id !== temporaryId && folder.id !== created.id),
            ]);
        } catch (createError) {
            console.error("Failed to create canvas folder:", createError);
            setFolders((current) => current.filter((folder) => folder.id !== temporaryId));
            setFolderForm((current) => current.name || current.category ? current : submittedForm);
            setError("캔버스 폴더를 만들지 못했습니다.");
        } finally {
            setIsCreatingFolder(false);
        }
    };

    const handleUpdateFolder = async (folderId: string) => {
        if (!editingFolderForm.name.trim()) return;
        try {
            replaceFolder(await updateCanvasFolder(folderId, editingFolderForm));
            setEditingFolderId(null);
        } catch (updateError) {
            console.error("Failed to update canvas folder:", updateError);
            setError("캔버스 폴더를 수정하지 못했습니다.");
        }
    };

    const handleDeleteFolder = async (folderId: string) => {
        try {
            await deleteCanvasFolder(folderId);
            setFolders((current) => current.filter((folder) => folder.id !== folderId));
        } catch (deleteError) {
            console.error("Failed to delete canvas folder:", deleteError);
            setError("캔버스 폴더를 삭제하지 못했습니다.");
        }
    };

    const handleUpdateCanvas = async (canvasId: string) => {
        const title = editingCanvasTitle.trim();
        if (!title) return;
        try {
            const updated = await updateCanvasDocument(canvasId, title);
            setDocuments((current) => current.map((document) => (document.id === canvasId ? updated : document)));
            setEditingCanvasId(null);
        } catch (updateError) {
            console.error("Failed to update canvas:", updateError);
            setError("캔버스 이름을 수정하지 못했습니다.");
        }
    };

    const handleDeleteCanvas = async (canvasId: string) => {
        try {
            await deleteCanvasDocument(canvasId);
            setDocuments((current) => current.filter((document) => document.id !== canvasId));
            setFolders((current) => current.map((folder) => ({
                ...folder, canvasIds: folder.canvasIds.filter((id) => id !== canvasId),
            })));
            setConfirmingDeleteId(null);
        } catch (deleteError) {
            console.error("Failed to delete canvas:", deleteError);
            setError("캔버스를 삭제하지 못했습니다.");
        }
    };

    const handleDropOnFolder = async (event: DragEvent<HTMLElement>, folderId: string) => {
        event.preventDefault();
        const canvasId = event.dataTransfer.getData("text/plain");
        if (!canvasId) return;
        try {
            const updated = await addCanvasToFolder(folderId, canvasId);
            setFolders((current) => current.map((folder) => (folder.id === updated.id ? updated : {
                ...folder, canvasIds: folder.canvasIds.filter((id) => id !== canvasId),
            })));
        } catch (moveError) {
            console.error("Failed to move canvas:", moveError);
            setError("캔버스를 폴더로 이동하지 못했습니다.");
        }
    };

    const handleDropOnUnfiled = async (event: DragEvent<HTMLElement>) => {
        event.preventDefault();
        const canvasId = event.dataTransfer.getData("text/plain");
        const folderId = folderIdByCanvasId.get(canvasId);
        if (!canvasId || !folderId) return;
        try {
            replaceFolder(await removeCanvasFromFolder(folderId, canvasId));
        } catch (moveError) {
            console.error("Failed to remove canvas from folder:", moveError);
            setError("캔버스를 폴더에서 빼지 못했습니다.");
        }
    };

    const toggleFolder = (folderId: string) => setCollapsedFolderIds((current) => {
        const next = new Set(current);
        if (next.has(folderId)) next.delete(folderId); else next.add(folderId);
        return next;
    });

    const canvasCard = (document: CanvasDocumentSummary) => {
        const isPending = isOptimisticCanvas(document.id);
        return (
        <article key={document.id} data-pending={isPending ? "true" : "false"} draggable={!isPending} onDragStart={(event) => event.dataTransfer.setData("text/plain", document.id)} className={`flex min-h-28 flex-col rounded-md border bg-white shadow-sm transition ${isPending ? "border-amber-300" : "border-stone-200 hover:border-amber-400 hover:shadow-md"}`}>
            <div className="flex flex-1 items-start gap-2 p-3">
                {isPending ? (
                    <div className="flex min-w-0 flex-1 items-center gap-2" role="status">
                        <Loader2 size={16} className="shrink-0 animate-spin text-amber-700" />
                        <div className="min-w-0"><h3 className="truncate text-sm font-black text-stone-900">{document.title}</h3><p className="mt-1 text-xs text-amber-700">서버에 만드는 중</p></div>
                    </div>
                ) : editingCanvasId === document.id ? (
                    <input className="min-w-0 flex-1 rounded-md border border-stone-300 px-2 py-1 text-sm font-bold" value={editingCanvasTitle} onChange={(event) => setEditingCanvasTitle(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") void handleUpdateCanvas(document.id); if (event.key === "Escape") setEditingCanvasId(null); }} autoFocus />
                ) : (
                    <button type="button" onClick={() => navigate(`/canvas/${document.id}`)} className="min-w-0 flex-1 text-left">
                        <h3 className="line-clamp-2 text-sm font-black text-stone-900">{document.title || "제목 없음"}</h3>
                        <p className="mt-2 text-xs text-stone-400">{formatDate(document.updated_at ?? document.created_at)}</p>
                    </button>
                )}
                <div className="flex shrink-0 gap-1">
                    {editingCanvasId === document.id ? (
                        <><button type="button" className="inline-flex h-8 w-8 items-center justify-center rounded-md hover:bg-stone-100" onClick={() => void handleUpdateCanvas(document.id)} title="이름 저장"><Check size={15} /></button><button type="button" className="inline-flex h-8 w-8 items-center justify-center rounded-md hover:bg-stone-100" onClick={() => setEditingCanvasId(null)} title="이름 수정 취소"><X size={15} /></button></>
                    ) : (
                        <><button type="button" className="inline-flex h-8 w-8 items-center justify-center rounded-md text-stone-500 hover:bg-stone-100" onClick={() => { setEditingCanvasId(document.id); setEditingCanvasTitle(document.title); }} title="이름 수정"><Pencil size={15} /></button><button type="button" className="inline-flex h-8 w-8 items-center justify-center rounded-md text-stone-500 hover:bg-red-50 hover:text-red-600" onClick={() => setConfirmingDeleteId(document.id)} title="캔버스 삭제"><Trash2 size={15} /></button></>
                    )}
                </div>
            </div>
            {confirmingDeleteId === document.id && <div className="flex items-center justify-end gap-2 border-t border-stone-100 px-3 py-2 text-xs"><span className="mr-auto text-stone-500">삭제할까요?</span><button type="button" className="font-bold text-red-600" onClick={() => void handleDeleteCanvas(document.id)}>삭제</button><button type="button" className="font-bold text-stone-500" onClick={() => setConfirmingDeleteId(null)}>취소</button></div>}
        </article>
        );
    };

    return (
        <div className="min-h-[calc(100vh-56px)] bg-stone-50 px-4 py-6 text-stone-900">
            <div className="mx-auto max-w-7xl">
                <header className="mb-5 flex flex-wrap items-end justify-between gap-3">
                    <div><p className="text-xs font-bold uppercase text-amber-700">Canvas Library</p><h1 className="text-2xl font-black text-stone-950 md:text-3xl">그림판 관리</h1><p className="text-sm text-stone-500">최근 작업과 폴더별 캔버스를 한곳에서 관리합니다.</p></div>
                    <button type="button" onClick={() => void handleCreateCanvas()} disabled={isCreating} className="inline-flex min-h-10 items-center gap-2 rounded-md bg-stone-900 px-4 py-2 text-sm font-bold text-white hover:bg-stone-700 disabled:opacity-60">{isCreating ? <Loader2 size={16} className="animate-spin" /> : <Plus size={16} />} 새 캔버스</button>
                </header>

                <div className="mb-4 grid gap-2 rounded-lg border border-stone-200 p-3 md:grid-cols-[1fr_1fr_auto]">
                    <input className="rounded-md border border-stone-300 px-3 py-2 text-sm" value={folderForm.category} onChange={(event) => setFolderForm((current) => ({ ...current, category: event.target.value }))} placeholder="카테고리" />
                    <input className="rounded-md border border-stone-300 px-3 py-2 text-sm" value={folderForm.name} onChange={(event) => setFolderForm((current) => ({ ...current, name: event.target.value }))} placeholder="폴더 이름" />
                    <button type="button" className="inline-flex min-h-10 items-center justify-center rounded-md bg-stone-900 px-3 text-white disabled:bg-stone-300" onClick={() => void handleCreateFolder()} disabled={!folderForm.name.trim() || isCreatingFolder} title="폴더 추가">{isCreatingFolder ? <Loader2 size={18} className="animate-spin" /> : <Plus size={18} />}</button>
                </div>

                {error && <p className="mb-4 rounded-md bg-red-50 p-3 text-sm font-semibold text-red-700" role="alert">{error}</p>}
                {isLoading ? (
                    <div className="flex items-center justify-center gap-2 border-y border-stone-200 py-16 text-sm font-semibold text-stone-400"><Loader2 size={18} className="animate-spin" /> 캔버스를 불러오는 중...</div>
                ) : (
                    <>
                        <section data-testid="canvas-recent-section" className="mb-6 border-y border-stone-200 py-4"><div className="mb-3"><h2 className="text-base font-black">최근 캔버스</h2><p className="text-xs text-stone-500">최근 수정하거나 만든 순서</p></div><div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">{recentCanvases.length > 0 ? recentCanvases.map(canvasCard) : <p className="py-6 text-sm text-stone-500">아직 만든 캔버스가 없습니다.</p>}</div></section>
                        <div className="space-y-7">
                            {folderCategoryEntries.map(([category, categoryFolders]) => (
                                <section key={category}>
                                    <h2 className="mb-3 border-b border-stone-300 pb-2 text-xs font-bold uppercase text-stone-500">{category}</h2>
                                    <div className="space-y-5">
                                        {categoryFolders.map((folder) => {
                                            const folderCanvasIds = new Set(folder.canvasIds);
                                            const folderCanvases = sortLibraryItemsByRecent(documents.filter((document) => folderCanvasIds.has(document.id)), (document) => document.title);
                                            const isEditing = editingFolderId === folder.id;
                                            const isCollapsed = collapsedFolderIds.has(folder.id);
                                            const isPending = isOptimisticFolder(folder.id);
                                            return (
                                                <div key={folder.id} data-pending={isPending ? "true" : "false"} className="border-l-2 border-amber-400 pl-3" onDragOver={(event) => event.preventDefault()} onDrop={(event) => { if (!isPending) void handleDropOnFolder(event, folder.id); }}>
                                                    <div className="mb-3 flex items-center gap-2">
                                                        {isEditing ? <div className="grid min-w-0 flex-1 gap-2 sm:grid-cols-2"><input className="rounded-md border border-stone-300 px-2 py-1 text-sm" value={editingFolderForm.category} onChange={(event) => setEditingFolderForm((current) => ({ ...current, category: event.target.value }))} placeholder="카테고리" /><input className="rounded-md border border-stone-300 px-2 py-1 text-sm" value={editingFolderForm.name} onChange={(event) => setEditingFolderForm((current) => ({ ...current, name: event.target.value }))} placeholder="폴더 이름" /></div> : <button type="button" className="flex min-w-0 flex-1 items-center gap-2 text-left" onClick={() => toggleFolder(folder.id)} title={isCollapsed ? "폴더 펼치기" : "폴더 접기"}><Folder size={17} className="text-amber-600" /><span className="truncate text-sm font-bold">{folder.name}</span>{isPending ? <Loader2 size={14} className="animate-spin text-amber-700" aria-label="폴더 만드는 중" /> : <span className="text-xs text-stone-400">{folderCanvases.length}</span>}</button>}
                                                        {!isPending && (isEditing ? <><button type="button" className="inline-flex h-8 w-8 items-center justify-center rounded-md hover:bg-stone-100" onClick={() => void handleUpdateFolder(folder.id)} title="폴더 저장"><Check size={15} /></button><button type="button" className="inline-flex h-8 w-8 items-center justify-center rounded-md hover:bg-stone-100" onClick={() => setEditingFolderId(null)} title="폴더 수정 취소"><X size={15} /></button></> : <><button type="button" className="inline-flex h-8 w-8 items-center justify-center rounded-md hover:bg-stone-100" onClick={() => void handleCreateCanvas(folder.id)} title="폴더에 캔버스 추가"><Plus size={15} /></button><button type="button" className="inline-flex h-8 w-8 items-center justify-center rounded-md hover:bg-stone-100" onClick={() => { setEditingFolderId(folder.id); setEditingFolderForm({ category: folder.category, name: folder.name }); }} title="폴더 수정"><Pencil size={15} /></button><button type="button" className="inline-flex h-8 w-8 items-center justify-center rounded-md text-stone-500 hover:bg-red-50 hover:text-red-600" onClick={() => void handleDeleteFolder(folder.id)} title="폴더 삭제"><Trash2 size={15} /></button></>)}
                                                    </div>
                                                    {!isCollapsed && <div className="grid min-h-20 gap-2 rounded-md border border-dashed border-stone-300 p-2 sm:grid-cols-2 xl:grid-cols-3">{folderCanvases.length > 0 ? folderCanvases.map(canvasCard) : <p className="py-6 text-center text-xs text-stone-500 sm:col-span-2 xl:col-span-3">캔버스를 드래그해서 넣으세요</p>}</div>}
                                                </div>
                                            );
                                        })}
                                    </div>
                                </section>
                            ))}
                            <section className="border-t border-stone-300 pt-4" onDragOver={(event) => event.preventDefault()} onDrop={handleDropOnUnfiled}><h2 className="mb-3 text-sm font-black">폴더 없음</h2><div className="grid min-h-20 gap-2 rounded-md border border-dashed border-stone-300 p-2 sm:grid-cols-2 xl:grid-cols-3">{unfiledCanvases.length > 0 ? unfiledCanvases.map(canvasCard) : <p className="py-6 text-center text-sm text-stone-500 sm:col-span-2 xl:col-span-3">폴더 밖 캔버스가 없습니다.</p>}</div></section>
                        </div>
                    </>
                )}
            </div>
        </div>
    );
}
