import { useMemo, useState, type Dispatch, type DragEvent, type SetStateAction } from "react";
import { Check, ChevronDown, ChevronRight, Folder, MoreVertical, PanelLeftClose, PanelLeftOpen, Pencil, Plus, Trash2, X } from "lucide-react";
import {
    CANVAS_COLLAPSED_FOLDER_IDS_STORAGE_KEY,
    buildCanvasFolderIdByCanvasId,
    getUnfiledCanvases,
    groupCanvasFoldersByCategory,
} from "@/features/canvas";
import {
    addCanvasToFolder,
    createCanvasDocument,
    createCanvasFolder,
    deleteCanvasDocument,
    deleteCanvasFolder,
    removeCanvasFromFolder,
    updateCanvasDocument,
    updateCanvasFolder,
    type CanvasDocumentSummary,
    type CanvasFolder,
} from "@/entities/canvas";
import { useLocalStorageStringSet } from "@/shared/lib/useLocalStorageStringSet";

type FolderForm = {
    category: string;
    name: string;
};

const EMPTY_FOLDER_FORM: FolderForm = {
    category: "",
    name: "",
};

type CanvasLibraryPanelProps = {
    documents: CanvasDocumentSummary[];
    folders: CanvasFolder[];
    selectedCanvasId: string | null;
    libraryError: string | null;
    isVisible: boolean;
    onToggleVisible: () => void;
    onSelectCanvas: (canvasId: string) => void;
    onFlushCurrentCanvasSave: () => void;
    setCanvasDocuments: Dispatch<SetStateAction<CanvasDocumentSummary[]>>;
    setCanvasFolders: Dispatch<SetStateAction<CanvasFolder[]>>;
    setSelectedCanvasId: Dispatch<SetStateAction<string | null>>;
    setLibraryError: (message: string | null) => void;
};

/** 캔버스 문서/폴더 사이드바. 목록 표시와 문서·폴더 CRUD, 드래그 정리를 담당한다. */
export const CanvasLibraryPanel = ({
    documents,
    folders,
    selectedCanvasId,
    libraryError,
    isVisible,
    onToggleVisible,
    onSelectCanvas,
    onFlushCurrentCanvasSave,
    setCanvasDocuments,
    setCanvasFolders,
    setSelectedCanvasId,
    setLibraryError,
}: CanvasLibraryPanelProps) => {
    const [folderForm, setFolderForm] = useState<FolderForm>(EMPTY_FOLDER_FORM);
    const [editingFolderId, setEditingFolderId] = useState<string | null>(null);
    const [editingFolderForm, setEditingFolderForm] = useState<FolderForm>(EMPTY_FOLDER_FORM);
    const [editingCanvasId, setEditingCanvasId] = useState<string | null>(null);
    const [editingCanvasTitle, setEditingCanvasTitle] = useState("");
    const [openCanvasMenuId, setOpenCanvasMenuId] = useState<string | null>(null);
    const [openFolderMenuId, setOpenFolderMenuId] = useState<string | null>(null);
    const [collapsedFolderIds, setCollapsedFolderIds] = useLocalStorageStringSet(CANVAS_COLLAPSED_FOLDER_IDS_STORAGE_KEY);

    const canvasFolderIdByCanvasId = useMemo(() => buildCanvasFolderIdByCanvasId(folders), [folders]);

    const unfiledCanvases = useMemo(() => (
        getUnfiledCanvases(documents, canvasFolderIdByCanvasId)
    ), [documents, canvasFolderIdByCanvasId]);

    const canvasFoldersByCategory = useMemo(() => (
        groupCanvasFoldersByCategory(folders)
    ), [folders]);

    const replaceFolder = (updated: CanvasFolder) => {
        setCanvasFolders((prev) => prev.map((folder) => (folder.id === updated.id ? updated : folder)));
    };

    const handleCreateCanvas = async (folderId?: string) => {
        try {
            onFlushCurrentCanvasSave();
            const created = await createCanvasDocument(`새 캔버스_${Date.now()}`);
            setCanvasDocuments((prev) => [created, ...prev]);
            if (folderId) {
                const updatedFolder = await addCanvasToFolder(folderId, created.id);
                setCanvasFolders((prev) => prev.map((folder) => (folder.id === updatedFolder.id ? updatedFolder : {
                    ...folder,
                    canvasIds: folder.canvasIds.filter((canvasId) => canvasId !== created.id),
                })));
            }
            onSelectCanvas(created.id);
        } catch (error) {
            console.error("Failed to create canvas:", error);
            setLibraryError("캔버스를 생성하는 중 오류가 발생했습니다.");
        }
    };

    const handleCreateFolder = async () => {
        if (!folderForm.name.trim()) return;
        try {
            const created = await createCanvasFolder(folderForm);
            setCanvasFolders((prev) => [created, ...prev]);
            setFolderForm(EMPTY_FOLDER_FORM);
        } catch (error) {
            console.error("Failed to create canvas folder:", error);
            setLibraryError("캔버스 폴더를 생성하는 중 오류가 발생했습니다.");
        }
    };

    const handleUpdateFolder = async (folderId: string) => {
        if (!editingFolderForm.name.trim()) return;
        try {
            const updated = await updateCanvasFolder(folderId, editingFolderForm);
            replaceFolder(updated);
            setEditingFolderId(null);
            setOpenFolderMenuId(null);
        } catch (error) {
            console.error("Failed to update canvas folder:", error);
            setLibraryError("캔버스 폴더를 수정하는 중 오류가 발생했습니다.");
        }
    };

    const handleDeleteFolder = async (folderId: string) => {
        try {
            await deleteCanvasFolder(folderId);
            setCanvasFolders((prev) => prev.filter((folder) => folder.id !== folderId));
            setOpenFolderMenuId(null);
        } catch (error) {
            console.error("Failed to delete canvas folder:", error);
            setLibraryError("캔버스 폴더를 삭제하는 중 오류가 발생했습니다.");
        }
    };

    const handleUpdateCanvasTitle = async (canvasId: string) => {
        const title = editingCanvasTitle.trim();
        if (!title) return;
        try {
            const updated = await updateCanvasDocument(canvasId, title);
            setCanvasDocuments((prev) => prev.map((document) => (document.id === canvasId ? updated : document)));
            setEditingCanvasId(null);
            setOpenCanvasMenuId(null);
        } catch (error) {
            console.error("Failed to update canvas title:", error);
            setLibraryError("캔버스 이름을 수정하는 중 오류가 발생했습니다.");
        }
    };

    const handleDeleteCanvas = async (canvasId: string) => {
        try {
            await deleteCanvasDocument(canvasId);
            setCanvasDocuments((prev) => {
                const next = prev.filter((document) => document.id !== canvasId);
                setSelectedCanvasId((current) => (current === canvasId ? next[0]?.id ?? null : current));
                return next;
            });
            setCanvasFolders((prev) => prev.map((folder) => ({
                ...folder,
                canvasIds: folder.canvasIds.filter((id) => id !== canvasId),
            })));
            setOpenCanvasMenuId(null);
        } catch (error) {
            console.error("Failed to delete canvas:", error);
            setLibraryError("캔버스를 삭제하는 중 오류가 발생했습니다.");
        }
    };

    const handleDropOnFolder = async (event: DragEvent<HTMLDivElement>, folderId: string) => {
        event.preventDefault();
        const canvasId = event.dataTransfer.getData("text/plain");
        if (!canvasId) return;
        try {
            const updated = await addCanvasToFolder(folderId, canvasId);
            setCanvasFolders((prev) => prev.map((folder) => (folder.id === updated.id ? updated : {
                ...folder,
                canvasIds: folder.canvasIds.filter((id) => id !== canvasId),
            })));
        } catch (error) {
            console.error("Failed to move canvas into folder:", error);
            setLibraryError("캔버스를 폴더로 이동하는 중 오류가 발생했습니다.");
        }
    };

    const handleDropOnUnfiled = async (event: DragEvent<HTMLDivElement>) => {
        event.preventDefault();
        const canvasId = event.dataTransfer.getData("text/plain");
        const folderId = canvasFolderIdByCanvasId.get(canvasId);
        if (!canvasId || !folderId) return;
        try {
            const updated = await removeCanvasFromFolder(folderId, canvasId);
            replaceFolder(updated);
        } catch (error) {
            console.error("Failed to remove canvas from folder:", error);
            setLibraryError("캔버스를 폴더에서 빼는 중 오류가 발생했습니다.");
        }
    };

    const beginEditFolder = (folder: CanvasFolder) => {
        setEditingFolderId(folder.id);
        setEditingFolderForm({ category: folder.category, name: folder.name });
        setOpenFolderMenuId(null);
    };

    const beginEditCanvas = (document: CanvasDocumentSummary) => {
        setEditingCanvasId(document.id);
        setEditingCanvasTitle(document.title);
        setOpenCanvasMenuId(null);
    };

    const toggleFolderCollapsed = (folderId: string) => {
        setCollapsedFolderIds((current) => {
            const next = new Set(current);
            if (next.has(folderId)) next.delete(folderId);
            else next.add(folderId);
            return next;
        });
    };

    const canvasCard = (document: CanvasDocumentSummary) => (
        <div
            key={document.id}
            draggable
            onDragStart={(event) => event.dataTransfer.setData("text/plain", document.id)}
            className={`mb-2 rounded-md border bg-white text-stone-900 shadow-sm transition ${
                selectedCanvasId === document.id ? "border-amber-500 ring-2 ring-amber-200" : "border-stone-200 hover:border-stone-300"
            }`}
        >
            <div className="flex items-start gap-2 p-2">
                {editingCanvasId === document.id ? (
                    <input
                        className="min-w-0 flex-1 rounded-md border border-stone-300 px-2 py-1 text-xs"
                        value={editingCanvasTitle}
                        onChange={(event) => setEditingCanvasTitle(event.target.value)}
                        onKeyDown={(event) => {
                            if (event.key === "Enter") void handleUpdateCanvasTitle(document.id);
                            if (event.key === "Escape") setEditingCanvasId(null);
                        }}
                        autoFocus
                    />
                ) : (
                    <button
                        type="button"
                        className="min-w-0 flex-1 truncate text-left text-sm font-semibold"
                        onClick={() => onSelectCanvas(document.id)}
                    >
                        {document.title}
                    </button>
                )}
                {editingCanvasId === document.id ? (
                    <div className="flex shrink-0 gap-1">
                        <button type="button" className="inline-flex h-7 w-7 items-center justify-center rounded-md hover:bg-stone-100" onClick={() => void handleUpdateCanvasTitle(document.id)}>
                            <Check size={14} />
                        </button>
                        <button type="button" className="inline-flex h-7 w-7 items-center justify-center rounded-md hover:bg-stone-100" onClick={() => setEditingCanvasId(null)}>
                            <X size={14} />
                        </button>
                    </div>
                ) : (
                    <div className="relative shrink-0">
                        <button type="button" className="inline-flex h-7 w-7 items-center justify-center rounded-md hover:bg-stone-100" onClick={() => setOpenCanvasMenuId((current) => (current === document.id ? null : document.id))}>
                            <MoreVertical size={14} />
                        </button>
                        {openCanvasMenuId === document.id && (
                            <div className="absolute right-0 z-30 mt-1 w-28 overflow-hidden rounded-md border border-stone-200 bg-white text-xs shadow-lg">
                                <button type="button" className="flex w-full items-center gap-2 px-3 py-2 text-left hover:bg-stone-100" onClick={() => beginEditCanvas(document)}>
                                    <Pencil size={13} />
                                    수정
                                </button>
                                <button type="button" className="flex w-full items-center gap-2 px-3 py-2 text-left text-red-600 hover:bg-red-50" onClick={() => void handleDeleteCanvas(document.id)}>
                                    <Trash2 size={13} />
                                    삭제
                                </button>
                            </div>
                        )}
                    </div>
                )}
            </div>
        </div>
    );

    if (!isVisible) {
        return (
            <button
                type="button"
                data-canvas-touch-allow="true"
                className="absolute left-0 top-20 z-40 inline-flex h-11 items-center gap-2 rounded-r-md border border-l-0 border-stone-300 bg-white px-3 text-sm font-bold text-stone-800 shadow-lg hover:bg-stone-900 hover:text-amber-50"
                onClick={onToggleVisible}
                title="캔버스 폴더 펼치기"
                aria-label="캔버스 폴더 펼치기"
            >
                <PanelLeftOpen size={18} />
                <span className="hidden sm:inline">폴더</span>
            </button>
        );
    }

    return (
        <aside
            data-canvas-touch-allow="true"
            className="absolute left-4 top-20 z-40 max-h-[calc(100%-6rem)] w-72 overflow-y-auto rounded-lg border border-stone-300 bg-stone-50 p-3 text-stone-900 shadow-xl"
            onDragStart={(event) => event.stopPropagation()}
        >
            <div className="mb-3 flex items-center justify-between">
                <div>
                    <p className="text-[11px] font-bold uppercase text-amber-700">Canvas Library</p>
                    <h2 className="text-base font-black">캔버스 폴더</h2>
                </div>
                <div className="flex shrink-0 gap-1">
                    <button type="button" className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-stone-200 bg-white text-stone-800 hover:bg-stone-100" onClick={onToggleVisible} title="캔버스 폴더 숨기기" aria-label="캔버스 폴더 숨기기">
                        <PanelLeftClose size={16} />
                    </button>
                    <button type="button" className="inline-flex h-8 w-8 items-center justify-center rounded-md bg-stone-900 text-white" onClick={() => void handleCreateCanvas()} title="캔버스 추가">
                        <Plus size={16} />
                    </button>
                </div>
            </div>

            <div className="mb-3 grid gap-2">
                <input className="rounded-md border border-stone-300 px-2 py-2 text-xs text-stone-900" value={folderForm.category} onChange={(event) => setFolderForm((prev) => ({ ...prev, category: event.target.value }))} placeholder="카테고리" />
                <div className="flex gap-2">
                    <input className="min-w-0 flex-1 rounded-md border border-stone-300 px-2 py-2 text-xs text-stone-900" value={folderForm.name} onChange={(event) => setFolderForm((prev) => ({ ...prev, name: event.target.value }))} placeholder="폴더 이름" />
                    <button type="button" className="inline-flex h-9 w-9 items-center justify-center rounded-md bg-stone-900 text-white disabled:bg-stone-300" onClick={() => void handleCreateFolder()} disabled={!folderForm.name.trim()} title="폴더 추가">
                        <Plus size={16} />
                    </button>
                </div>
            </div>

            {libraryError && <p className="mb-3 rounded-md bg-red-50 p-2 text-xs text-red-700">{libraryError}</p>}

            <div className="space-y-3">
                {Object.entries(canvasFoldersByCategory).map(([category, categoryFolders]) => (
                    <section key={category}>
                        <h3 className="mb-2 border-b border-stone-200 pb-1 text-[11px] font-bold uppercase text-stone-500">{category}</h3>
                        <div className="space-y-2">
                            {categoryFolders.map((folder) => {
                                const folderCanvasIds = new Set(folder.canvasIds);
                                const folderCanvases = documents.filter((document) => folderCanvasIds.has(document.id));
                                const isEditing = editingFolderId === folder.id;
                                const isCollapsed = collapsedFolderIds.has(folder.id);

                                return (
                                    <div key={folder.id} className="rounded-lg border border-stone-200 bg-white p-2" onDragOver={(event) => event.preventDefault()} onDrop={(event) => void handleDropOnFolder(event, folder.id)}>
                                        <div className="mb-2 flex items-start justify-between gap-2">
                                            {isEditing ? (
                                                <div className="grid min-w-0 flex-1 gap-1">
                                                    <input className="rounded-md border border-stone-300 px-2 py-1 text-xs" value={editingFolderForm.category} onChange={(event) => setEditingFolderForm((prev) => ({ ...prev, category: event.target.value }))} placeholder="카테고리" />
                                                    <input className="rounded-md border border-stone-300 px-2 py-1 text-xs" value={editingFolderForm.name} onChange={(event) => setEditingFolderForm((prev) => ({ ...prev, name: event.target.value }))} placeholder="폴더 이름" />
                                                </div>
                                            ) : (
                                                <button type="button" className="flex min-w-0 items-center gap-2 text-left" onClick={() => toggleFolderCollapsed(folder.id)} title={isCollapsed ? "폴더 열기" : "폴더 접기"}>
                                                    {isCollapsed ? <ChevronRight size={15} className="shrink-0 text-stone-500" /> : <ChevronDown size={15} className="shrink-0 text-stone-500" />}
                                                    <Folder size={16} className="shrink-0 text-amber-600" />
                                                    <span className="truncate text-sm font-bold">{folder.name}</span>
                                                    <span className="rounded bg-stone-100 px-1.5 py-0.5 text-[10px] font-bold text-stone-500">{folderCanvases.length}</span>
                                                </button>
                                            )}

                                            {isEditing ? (
                                                <div className="flex shrink-0 gap-1">
                                                    <button type="button" className="inline-flex h-7 w-7 items-center justify-center rounded-md hover:bg-stone-100" onClick={() => void handleUpdateFolder(folder.id)}>
                                                        <Check size={14} />
                                                    </button>
                                                    <button type="button" className="inline-flex h-7 w-7 items-center justify-center rounded-md hover:bg-stone-100" onClick={() => setEditingFolderId(null)}>
                                                        <X size={14} />
                                                    </button>
                                                </div>
                                            ) : (
                                                <div className="relative shrink-0">
                                                    <button type="button" className="inline-flex h-7 w-7 items-center justify-center rounded-md hover:bg-stone-100" onClick={() => setOpenFolderMenuId((current) => (current === folder.id ? null : folder.id))}>
                                                        <MoreVertical size={14} />
                                                    </button>
                                                    {openFolderMenuId === folder.id && (
                                                        <div className="absolute right-0 z-30 mt-1 w-32 overflow-hidden rounded-md border border-stone-200 bg-white text-xs shadow-lg">
                                                            <button type="button" className="flex w-full items-center gap-2 px-3 py-2 text-left hover:bg-stone-100" onClick={() => beginEditFolder(folder)}>
                                                                <Pencil size={13} />
                                                                수정
                                                            </button>
                                                            <button type="button" className="flex w-full items-center gap-2 px-3 py-2 text-left hover:bg-stone-100" onClick={() => void handleCreateCanvas(folder.id)}>
                                                                <Plus size={13} />
                                                                캔버스 추가
                                                            </button>
                                                            <button type="button" className="flex w-full items-center gap-2 px-3 py-2 text-left text-red-600 hover:bg-red-50" onClick={() => void handleDeleteFolder(folder.id)}>
                                                                <Trash2 size={13} />
                                                                삭제
                                                            </button>
                                                        </div>
                                                    )}
                                                </div>
                                            )}
                                        </div>
                                        {!isCollapsed && (
                                            <div className="min-h-14 rounded-md border border-dashed border-stone-200 bg-stone-50 p-2">
                                                {folderCanvases.length > 0 ? folderCanvases.map(canvasCard) : <p className="py-3 text-center text-xs text-stone-500">캔버스를 드래그해서 넣으세요</p>}
                                            </div>
                                        )}
                                    </div>
                                );
                            })}
                        </div>
                    </section>
                ))}

                <section className="rounded-lg border border-dashed border-stone-300 bg-white p-2" onDragOver={(event) => event.preventDefault()} onDrop={handleDropOnUnfiled}>
                    <div className="mb-2 flex items-center justify-between">
                        <h3 className="text-xs font-bold text-stone-700">최근 캔버스</h3>
                        <button type="button" className="inline-flex h-7 w-7 items-center justify-center rounded-md border border-stone-200 hover:bg-stone-100" onClick={() => void handleCreateCanvas()} title="캔버스 추가">
                            <Plus size={14} />
                        </button>
                    </div>
                    {unfiledCanvases.length > 0 ? unfiledCanvases.map(canvasCard) : <p className="py-4 text-center text-xs text-stone-500">폴더 밖 캔버스가 없습니다</p>}
                </section>
            </div>
        </aside>
    );
};
