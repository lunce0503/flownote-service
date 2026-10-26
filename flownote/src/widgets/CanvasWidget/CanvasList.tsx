import { useCallback, useEffect, useMemo, useRef, useState, type DragEvent } from "react";
import { useNavigate } from "react-router-dom";
import { Check, ChevronDown, ChevronRight, Clock3, Ellipsis, FileText, Files, Folder, FolderPlus, Loader2, PanelLeft, PanelsTopLeft, Pencil, Plus, RefreshCw, Search, Trash2, X } from "lucide-react";
import { addNoteToFolder, createNoteFolder, deleteNote, deleteNoteFolder, getNoteFolders, getNoteSummaries, noteDrafts, postNoteData, removeNoteFromFolder, updateNoteFolder, updateNoteTitle, type NoteSummary, type NoteFolder } from '@/entities/blog';
import { useAuth } from '@/features/auth';
import { pauseNoteSave, waitForNoteSave } from '@/features/blog';
import { getAuthUser } from '@/shared/api';
import { newWorkspaceId } from '@/shared/lib/deviceMode';
import { getSyncClientId } from '@/shared/lib/sync';
import { workspaceFiles, workspaceFileKey, type WorkspaceFile } from '@/features/workspace';
import {
    addCanvasToFolder, createCanvasDocument, createCanvasFolder, deleteCanvasDocument,
    deleteCanvasFolder, getCanvasDocuments, getCanvasFolders, removeCanvasFromFolder,
    updateCanvasDocument, updateCanvasFolder, type CanvasDocumentSummary, type CanvasFolder,
} from "@/entities/canvas";
import {
    CANVAS_COLLAPSED_FOLDER_IDS_STORAGE_KEY, buildCanvasFolderIdByCanvasId,
    groupCanvasFoldersByCategory,
} from "@/features/canvas";
import { sortLibraryCategoryEntries } from "@/shared/lib/librarySorting";
import { useLocalStorageStringSet } from "@/shared/lib/useLocalStorageStringSet";
import { subscribeSyncEvents } from "@/shared/lib/sync";

import '@/shared/styles/workspace.css';
import './canvas-library.css';

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
    const { user } = useAuth();
    return user ? <WorkspaceList key={user.id} owner={user.id} /> : null;
}
function WorkspaceList({ owner }: { owner: string }) {
    const navigate = useNavigate();
    const [location, setLocation] = useState('recent');
    const [selectedId, setSelectedId] = useState<string | null>(null);
    const [search, setSearch] = useState('');
    const [explorerOpen, setExplorerOpen] = useState(() => window.matchMedia('(min-width: 701px)').matches);
    const explorerToggle = useRef<HTMLButtonElement>(null);
    const [showFolderForm, setShowFolderForm] = useState(false);
    const [movingCanvasId, setMovingCanvasId] = useState<string | null>(null);
    const [documents, setDocuments] = useState<CanvasDocumentSummary[]>([]);
    const [folders, setFolders] = useState<CanvasFolder[]>([]);
    const [notes, setNotes] = useState<NoteSummary[]>([]);
    const [noteFolders, setNoteFolders] = useState<NoteFolder[]>([]);
    const [fileKind, setFileKind] = useState<'all' | 'canvas' | 'note'>('all');
    const [sort, setSort] = useState<'recent' | 'title'>('recent');
    const [folderKind, setFolderKind] = useState<'canvas' | 'note'>('canvas');
    const requestGeneration = useRef(0);
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
        const generation = ++requestGeneration.current;
        setError(null);
        try {
            const currentRequest = () => getAuthUser()?.id === owner && generation === requestGeneration.current;
            const canvasRequest = getCanvasDocuments().then(result => {
                if (currentRequest()) { setDocuments(current => [...current.filter(document => isOptimisticCanvas(document.id)), ...result]); if (result.length) setIsLoading(false); }
                return result;
            });
            const results = await Promise.allSettled([canvasRequest, getCanvasFolders(), getNoteSummaries(undefined, page => {
                if (currentRequest()) { setNotes(page); if (page.length) setIsLoading(false); }
            }), getNoteFolders()]);
            if (getAuthUser()?.id !== owner || generation !== requestGeneration.current) return;
            const [canvasResult, folderResult, noteResult, noteFolderResult] = results;
            if (canvasResult.status === 'fulfilled') setDocuments((current) => [
                ...current.filter((document) => isOptimisticCanvas(document.id)),
                ...canvasResult.value,
            ]);
            if (folderResult.status === 'fulfilled') setFolders((current) => {
                const optimisticFolders = current.filter((folder) => isOptimisticFolder(folder.id));
                const loadedWithPendingDocuments = folderResult.value.map((folder) => {
                    const currentFolder = current.find((candidate) => candidate.id === folder.id);
                    const pendingCanvasIds = currentFolder?.canvasIds.filter(isOptimisticCanvas) ?? [];
                    return {
                        ...folder,
                        canvasIds: [...pendingCanvasIds, ...folder.canvasIds],
                    };
                });
                return [...optimisticFolders, ...loadedWithPendingDocuments];
            });
            if (noteResult.status === 'fulfilled') setNotes(noteResult.value);
            if (noteFolderResult.status === 'fulfilled') setNoteFolders(noteFolderResult.value);
            if (results.some(result => result.status === 'rejected')) setError('목록 일부를 불러오지 못했습니다. 기존 목록은 유지했습니다. 다시 시도해 주세요.');
        } catch (loadError) {
            console.error("Failed to load canvas library:", loadError);
            setError("작업 공간 목록을 불러오지 못했습니다.");
        } finally {
            setIsLoading(false);
        }
    }, [owner]);

    useEffect(() => {
        const timer = window.setTimeout(() => void loadLibrary(), 0);
        return () => window.clearTimeout(timer);
    }, [loadLibrary]);
    useEffect(() => subscribeSyncEvents((event) => {
        if (event.resource === "canvas" || event.resource === "notes" || event.resource === "all") void loadLibrary();
    }), [loadLibrary]);

    const folderIdByCanvasId = useMemo(() => buildCanvasFolderIdByCanvasId(folders), [folders]);
    const noteFolderByNoteId = useMemo(() => new Map(noteFolders.flatMap(folder => folder.noteIds.map(id => [id, folder.id] as const))), [noteFolders]);
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
        if (folderKind === 'note') {
            setIsCreatingFolder(true); setError(null);
            try {
                const created = await createNoteFolder({ name: folderForm.name.trim(), category: folderForm.category.trim() });
                if (getAuthUser()?.id !== owner) return;
                setNoteFolders(current => [...current.filter(folder => folder.id !== created.id), created]);
                setFolderForm(EMPTY_FOLDER_FORM); setShowFolderForm(false); setLocation(`note:${created.id}`);
            } catch { setError('노트 폴더를 만들지 못했습니다.'); }
            finally { setIsCreatingFolder(false); }
            return;
        }
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
            setShowFolderForm(false);
            setLocation(created.id);
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
        if (folderId.startsWith('note:')) {
            try { await updateNoteFolder(folderId.slice(5), editingFolderForm); setEditingFolderId(null); await loadLibrary(); }
            catch { setError('노트 폴더를 수정하지 못했습니다.'); }
            return;
        }
        try {
            replaceFolder(await updateCanvasFolder(folderId, editingFolderForm));
            setEditingFolderId(null);
        } catch (updateError) {
            console.error("Failed to update canvas folder:", updateError);
            setError("캔버스 폴더를 수정하지 못했습니다.");
        }
    };

    const handleDeleteFolder = async (folderId: string) => {
        if (folderId.startsWith('note:')) {
            try { await deleteNoteFolder(folderId.slice(5)); setLocation('unfiled'); await loadLibrary(); }
            catch { setError('노트 폴더를 삭제하지 못했습니다.'); }
            return;
        }
        try {
            await deleteCanvasFolder(folderId);
            if (location === folderId) setLocation("unfiled");
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
        if (event.dataTransfer.getData('application/x-flownote-kind') === 'note') {
            setError('노트는 노트 폴더로 이동할 수 있습니다.'); return;
        }
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
        if (event.dataTransfer.getData('application/x-flownote-kind') === 'note') {
            const id = event.dataTransfer.getData('text/plain');
            const source = noteFolderByNoteId.get(id);
            if (source) { try { await removeNoteFromFolder(source, id); await loadLibrary(); } catch { setError('노트를 미분류로 이동하지 못했습니다.'); } }
            return;
        }
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

    const selectedFolder = folders.find(folder => folder.id === location);
    const selectedNoteFolder = noteFolders.find(folder => `note:${folder.id}` === location);
    const locationName = selectedFolder?.name ?? selectedNoteFolder?.name ?? ({ recent: '최근 항목', all: '모든 파일', unfiled: '미분류' }[location] ?? '최근 항목');
    const visibleDocuments = workspaceFiles(documents, notes, folders, noteFolders, location, search, fileKind, sort);
    const selectedDocument = visibleDocuments.find(document => workspaceFileKey(document) === selectedId);
    const selectLocation = (next: string) => {
        setLocation(next); setSelectedId(null); setSearch(''); setFileKind('all');
        if (window.matchMedia('(max-width: 700px)').matches) {
            setExplorerOpen(false); explorerToggle.current?.focus();
        }
    };
    const moveCanvas = async (canvasId: string, destination: string) => {
        if (movingCanvasId) return;
        setMovingCanvasId(canvasId); setError(null);
        try {
            const source = folderIdByCanvasId.get(canvasId);
            if (destination) {
                const updated = await addCanvasToFolder(destination, canvasId);
                setFolders(current => current.map(folder => folder.id === updated.id ? updated : { ...folder, canvasIds: folder.canvasIds.filter(id => id !== canvasId) }));
            } else if (source) replaceFolder(await removeCanvasFromFolder(source, canvasId));
        } catch {
            setError('캔버스를 이동하지 못했습니다. 다시 시도하세요.');
        } finally { setMovingCanvasId(null); }
    };
    const handleCreateNote = async () => {
        const title = window.prompt('새 노트 이름', '제목 없음'); if (!title?.trim()) return;
        setIsCreating(true); setError(null);
        try {
            const saved = await postNoteData({ id: newWorkspaceId(), title: title.trim(), content: { format: 'markdown', version: 1, markdown: '' },
                created_at: new Date().toISOString(), revision: 1, client_id: getSyncClientId() });
            if (getAuthUser()?.id !== owner) return;
            if (selectedNoteFolder) await addNoteToFolder(selectedNoteFolder.id, saved.id);
            navigate(`/blog/${saved.id}`);
        } catch {
            await loadLibrary();
            setError('파일 작업에 실패했습니다. 노트를 만들지 못했으며 기존 목록은 유지했습니다.');
        }
        finally { setIsCreating(false); }
    };
    const beginRename = (document: WorkspaceFile) => {
        setEditingCanvasId(workspaceFileKey(document)); setEditingCanvasTitle(document.title);
    };
    const renameFile = async (document: WorkspaceFile) => {
        if (document.kind === 'canvas') return handleUpdateCanvas(document.id);
        if (!editingCanvasTitle.trim()) return;
        try {
            await waitForNoteSave(owner, document.id);
            await updateNoteTitle(document.id, editingCanvasTitle.trim(), { revision: (document.revision ?? 0) + 1, clientId: getSyncClientId() });
            setEditingCanvasId(null); await loadLibrary();
        } catch { setError('노트 이름을 수정하지 못했습니다. 기기 초안은 유지됩니다.'); }
    };
    const deleteFile = async (document: WorkspaceFile) => {
        if (document.kind === 'canvas') return handleDeleteCanvas(document.id);
        try {
            pauseNoteSave(owner, document.id); await waitForNoteSave(owner, document.id);
            await deleteNote(document.id); await noteDrafts.remove(owner, document.id);
            setConfirmingDeleteId(null); await loadLibrary();
        } catch { setError('노트를 삭제하지 못했습니다.'); }
    };
    const moveNote = async (id: string, destination: string) => {
        if (movingCanvasId) return;
        setMovingCanvasId(id);
        try { const source = noteFolderByNoteId.get(id); if (destination) await addNoteToFolder(destination, id); else if (source) await removeNoteFromFolder(source, id); await loadLibrary(); }
        catch { setError('노트를 이동하지 못했습니다.'); } finally { setMovingCanvasId(null); }
    };
    const filePath = (document: WorkspaceFile) => `/${document.kind === 'note' ? 'blog' : 'canvas'}/${document.id}`;
    const canvasRow = (document: WorkspaceFile) => {
        const note = document.kind === 'note';
        const key = workspaceFileKey(document);
        const name = note ? '노트' : '캔버스';
        const pending = !note && isOptimisticCanvas(document.id);
        return <div key={key} role="row" className="canvas-file-row" aria-selected={selectedId === key} data-file-kind={document.kind}
            data-pending={pending ? 'true' : 'false'} tabIndex={pending ? -1 : 0} draggable={!pending}
            onDragStart={event => { event.dataTransfer.setData('text/plain', document.id); event.dataTransfer.setData('application/x-flownote-kind', document.kind); }}
            onClick={() => setSelectedId(key)}
            onDoubleClick={event => { if (!pending && !(event.target as HTMLElement).closest('button,input,select')) navigate(filePath(document)); }}
            onKeyDown={event => {
                if (event.target !== event.currentTarget || pending) return;
                if (event.key === 'Enter') navigate(filePath(document));
                if (event.key === 'F2') { event.preventDefault(); beginRename(document); }
                if (event.key === 'Delete') setConfirmingDeleteId(key);
            }}>
            <div role="cell" className="canvas-file-main">
                {pending ? <Loader2 size={19} className="canvas-loading-icon" /> : note ? <FileText size={19} aria-hidden="true" /> : <PanelsTopLeft size={19} aria-hidden="true" />}
                {pending ? <div role="status"><strong>{document.title}</strong><small>서버에 만드는 중</small></div>
                    : editingCanvasId === key ? <div className="canvas-inline-rename">
                        <input aria-label={`${name} 이름`} value={editingCanvasTitle} onChange={event => setEditingCanvasTitle(event.target.value)}
                            onKeyDown={event => { if (event.key === 'Enter') void renameFile(document); if (event.key === 'Escape') setEditingCanvasId(null); }} autoFocus />
                        <button onClick={() => void renameFile(document)} aria-label="이름 저장"><Check size={16} /></button>
                        <button onClick={() => setEditingCanvasId(null)} aria-label="이름 수정 취소"><X size={16} /></button>
                    </div> : <button className="canvas-file-name" onClick={() => navigate(filePath(document))} title={document.title}>{document.title || '제목 없음'}</button>}<small className="workspace-file-type">{name}</small>
            </div>
            <div role="cell" className="canvas-file-date">{formatDate(document.updated_at ?? document.created_at)}</div>
            <div role="cell" className="canvas-file-kind">{name}</div>
            <div role="cell" className="canvas-file-actions">
                {!pending && <>
                    <select aria-label={`${document.title} 이동`} disabled={!!movingCanvasId} value={(note ? noteFolderByNoteId : folderIdByCanvasId).get(document.id) ?? ''}
                        onChange={event => { if (note) void moveNote(document.id, event.target.value); else void moveCanvas(document.id, event.target.value); }}>
                        <option value="">미분류</option>{(note ? noteFolders : folders).filter(folder => !isOptimisticFolder(folder.id)).map(folder => <option key={folder.id} value={folder.id}>{folder.category} / {folder.name}</option>)}
                    </select>
                    <button aria-label={`${document.title} 이름 수정`} title="이름 수정" onClick={() => beginRename(document)}><Pencil size={15} /></button>
                    <button aria-label={`${document.title} 삭제`} title={`${name} 삭제`} onClick={() => setConfirmingDeleteId(key)}><Trash2 size={15} /></button>
                </>}
            </div>
            {confirmingDeleteId === key && <div className="canvas-delete-confirm" role="alert">
                <span>이 {name}를 삭제할까요?</span><button onClick={() => void deleteFile(document)}>삭제</button><button onClick={() => setConfirmingDeleteId(null)}>취소</button>
            </div>}
        </div>;
    };

    return <section className="canvas-library workspace-surface" data-testid="canvas-explorer" data-unified="true" aria-label="노트와 캔버스 작업 공간" onKeyDown={event => {
        if (event.key !== 'Escape') return;
        const menu = event.currentTarget.querySelector<HTMLDetailsElement>('details[open]');
        if (menu) { menu.open = false; menu.querySelector('summary')?.focus(); }
    }}>
        <header className="canvas-library-topbar">
            <button ref={explorerToggle} aria-label="탐색기 토글" aria-expanded={explorerOpen} aria-controls="canvas-folder-explorer" onClick={() => setExplorerOpen(open => !open)}><PanelLeft size={19} /></button>
            <h1>작업 공간</h1><span className="canvas-path-divider">/</span><span className="canvas-path" title={locationName}>{locationName}</span>
            <div className="canvas-topbar-actions">
                <button className="canvas-new-document" aria-label="새 캔버스" onClick={() => void handleCreateCanvas(selectedFolder?.id)} disabled={isCreating}><Plus size={16} /><span>새 캔버스</span></button>
                <button aria-label="새 노트" onClick={() => void handleCreateNote()} disabled={isCreating}><FileText size={16} /><span>새 노트</span></button>
                <button aria-label="새 폴더" title="새 폴더" onClick={() => { setFolderKind(selectedNoteFolder ? 'note' : 'canvas'); setShowFolderForm(value => !value); setEditingFolderId(null); }}><FolderPlus size={18} /></button>
            </div>
        </header>
        <div className="canvas-library-body">
            <aside id="canvas-folder-explorer" className={`canvas-explorer ${explorerOpen ? 'is-open' : ''}`} aria-label="파일 탐색기">
                <div className="canvas-explorer-heading"><span>탐색기</span><button aria-label="목록 새로고침" onClick={() => void loadLibrary()}><RefreshCw size={15} /></button></div>
                <nav aria-label="작업 공간 위치">
                    {([['recent', '최근 항목', Clock3], ['all', '모든 파일', PanelsTopLeft], ['unfiled', '미분류', Files]] as const).map(([id, label, Icon]) =>
                        <button key={id} aria-current={location === id ? 'page' : undefined} onClick={() => selectLocation(id)}><Icon size={17} /><span>{label}</span></button>)}
                </nav>
                <div role="tree" aria-label="폴더" onKeyDown={event => {
                    const target = event.target as HTMLElement;
                    if (target.getAttribute('role') !== 'treeitem') return;
                    const items = Array.from(event.currentTarget.querySelectorAll<HTMLElement>('[role="treeitem"]'));
                    const index = items.indexOf(target);
                    if (['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) {
                        event.preventDefault();items[event.key === 'Home' ? 0 : event.key === 'End' ? items.length - 1 : Math.max(0, Math.min(items.length - 1, index + (event.key === 'ArrowDown' ? 1 : -1)))]?.focus();
                    }
                    const id = target.dataset.folder;
                    if (id && ['ArrowLeft', 'ArrowRight'].includes(event.key)) {
                        event.preventDefault(); setCollapsedFolderIds(current => { const next = new Set(current); if (event.key === 'ArrowLeft') next.add(id); else next.delete(id); return next; });
                    }
                }}>
                    <div className="canvas-tree-category">캔버스 폴더</div>
                    {folderCategoryEntries.map(([category, categoryFolders]) => <div key={category} role="group" aria-label={category}>
                        <div className="canvas-tree-category">{category}</div>
                        {categoryFolders.map(folder => <div key={folder.id} onDragOver={event => event.preventDefault()} onDrop={event => { if (!isOptimisticFolder(folder.id)) void handleDropOnFolder(event, folder.id); }}>
                            <button role="treeitem" aria-level={1} aria-expanded={!collapsedFolderIds.has(folder.id)} aria-selected={location === folder.id}
                                data-folder={folder.id} className="canvas-tree-folder" onClick={() => { selectLocation(folder.id); toggleFolder(folder.id); }} disabled={isOptimisticFolder(folder.id)}>
                                {collapsedFolderIds.has(folder.id) ? <ChevronRight size={14} /> : <ChevronDown size={14} />}<Folder size={17} /><span title={folder.name}>{folder.name}</span><small>{folder.canvasIds.length}</small>
                            </button>
                            {!collapsedFolderIds.has(folder.id) && <div role="group" aria-label={`${folder.name} 캔버스`} className="canvas-tree-files">
                                {documents.filter(document => folder.canvasIds.includes(document.id) && !isOptimisticCanvas(document.id)).map(document => <button key={document.id} role="treeitem" aria-level={2} onClick={() => navigate(`/canvas/${document.id}`)}><PanelsTopLeft size={14} /><span>{document.title}</span></button>)}
                            </div>}
                        </div>)}
                    </div>)}
                    {!isLoading && folders.length === 0 && <p className="canvas-tree-empty">새 폴더로 캔버스를 정리하세요.</p>}
                    <div className="canvas-tree-category">노트 폴더</div>
                    {noteFolders.map(folder => <div key={`note:${folder.id}`} onDragOver={event => event.preventDefault()} onDrop={event => {
                        event.preventDefault(); const kind = event.dataTransfer.getData('application/x-flownote-kind'); const id = event.dataTransfer.getData('text/plain');
                        if (kind === 'note' && id) void moveNote(id, folder.id); else setError('캔버스는 캔버스 폴더로 이동할 수 있습니다.');
                    }}>
                        <button role="treeitem" aria-level={1} aria-expanded={!collapsedFolderIds.has(`note:${folder.id}`)} aria-selected={location === `note:${folder.id}`}
                            data-folder={`note:${folder.id}`} className="canvas-tree-folder" onClick={() => { selectLocation(`note:${folder.id}`); toggleFolder(`note:${folder.id}`); }}>
                            {collapsedFolderIds.has(`note:${folder.id}`) ? <ChevronRight size={14} /> : <ChevronDown size={14} />}<Folder size={17} /><span title={`${folder.category} / ${folder.name}`}>{folder.name}</span><small>{folder.noteIds.length}</small>
                        </button>
                        {!collapsedFolderIds.has(`note:${folder.id}`) && <div role="group" aria-label={`${folder.name} 노트`} className="canvas-tree-files">
                            {notes.filter(note => folder.noteIds.includes(note.id)).map(note => <button key={note.id} role="treeitem" aria-level={2} onClick={() => navigate(`/blog/${note.id}`)}><FileText size={14} /><span>{note.title}</span></button>)}
                        </div>}
                    </div>)}
                    {!isLoading && noteFolders.length === 0 && <p className="canvas-tree-empty">새 노트 폴더로 노트를 정리하세요.</p>}
                </div>
            </aside>
            <main className="canvas-library-content" aria-label="노트와 캔버스 파일 목록" onDragOver={event => event.preventDefault()} onDrop={event => { if (location === 'unfiled') void handleDropOnUnfiled(event); }}>
                <div className="canvas-location-toolbar">
                    <div><h2>{locationName}</h2><p>{visibleDocuments.length}개 항목{location === 'recent' ? ' · 최근 수정한 순서' : ''}</p></div>
                    <label className="canvas-search"><Search size={16} /><input aria-label="노트와 캔버스 검색" placeholder="파일 검색" value={search} onChange={event => setSearch(event.target.value)} /></label>
                    <select aria-label="파일 종류" value={fileKind} onChange={event => setFileKind(event.target.value as typeof fileKind)}><option value="all">모든 종류</option><option value="note">노트</option><option value="canvas">캔버스</option></select>
                    <select aria-label="파일 정렬" value={sort} onChange={event => setSort(event.target.value as typeof sort)}><option value="recent">최근 수정순</option><option value="title">이름순</option></select>
                    {selectedFolder && <details className="canvas-folder-menu"><summary aria-label="현재 폴더 동작"><Ellipsis size={18} /></summary><div>
                        <button onClick={event => { event.currentTarget.closest("details")?.removeAttribute("open"); setEditingFolderId(selectedFolder.id); setEditingFolderForm({ category: selectedFolder.category, name: selectedFolder.name }); setShowFolderForm(false); }}>폴더 이름·카테고리 변경</button>
                        <button onClick={() => { if (window.confirm('폴더만 삭제할까요? 안의 캔버스는 미분류에 남습니다.')) void handleDeleteFolder(selectedFolder.id); }}>폴더만 삭제 (캔버스 유지)</button>
                    </div></details>}
                    {selectedNoteFolder && <details className="canvas-folder-menu"><summary aria-label="현재 폴더 동작"><Ellipsis size={18} /></summary><div>
                        <button onClick={event => { event.currentTarget.closest('details')?.removeAttribute('open'); setEditingFolderId(`note:${selectedNoteFolder.id}`); setEditingFolderForm({ category: selectedNoteFolder.category, name: selectedNoteFolder.name }); setShowFolderForm(false); }}>폴더 이름·카테고리 변경</button>
                        <button onClick={() => { if (window.confirm('폴더만 삭제할까요? 안의 노트는 미분류에 남습니다.')) void handleDeleteFolder(`note:${selectedNoteFolder.id}`); }}>폴더만 삭제 (노트 유지)</button>
                    </div></details>}
                </div>
                {(showFolderForm || editingFolderId) && <form className="canvas-folder-form" onSubmit={event => { event.preventDefault(); void (editingFolderId ? handleUpdateFolder(editingFolderId) : handleCreateFolder()); }}>
                    <strong>{editingFolderId ? '폴더 수정' : '새 폴더'}</strong>
                    {!editingFolderId && <select aria-label="폴더 종류" value={folderKind} onChange={event => setFolderKind(event.target.value as typeof folderKind)}><option value="canvas">캔버스 폴더</option><option value="note">노트 폴더</option></select>}
                    <input aria-label="폴더 카테고리" placeholder="카테고리" value={editingFolderId ? editingFolderForm.category : folderForm.category} onChange={event => (editingFolderId ? setEditingFolderForm : setFolderForm)(current => ({ ...current, category: event.target.value }))} />
                    <input aria-label="폴더 이름" placeholder="폴더 이름" autoFocus value={editingFolderId ? editingFolderForm.name : folderForm.name} onChange={event => (editingFolderId ? setEditingFolderForm : setFolderForm)(current => ({ ...current, name: event.target.value }))} />
                    <button type="submit" disabled={isCreatingFolder || !(editingFolderId ? editingFolderForm.name : folderForm.name).trim()}>{editingFolderId ? '폴더 저장' : '폴더 만들기'}</button>
                    <button type="button" onClick={() => { setShowFolderForm(false); setEditingFolderId(null); }}>취소</button>
                </form>}
                {selectedDocument && <div className="canvas-selection-toolbar"><span>{selectedDocument.title}</span><button onClick={() => navigate(filePath(selectedDocument))}>열기</button><button onClick={() => beginRename(selectedDocument)}>이름 수정</button></div>}
                {error && <div className="canvas-library-error" role="alert">{error}<button onClick={() => void loadLibrary()}>다시 시도</button></div>}
                {isLoading ? <div className="canvas-library-empty" role="status"><Loader2 size={22} className="canvas-loading-icon" />파일을 불러오는 중…</div> : <section data-testid={location === 'recent' ? 'canvas-recent-section' : 'canvas-folder-section'}>
                    <div role="table" aria-label={`${locationName} 파일`} className="canvas-files-table">
                        <div role="row" className="canvas-files-heading"><span role="columnheader">이름</span><span role="columnheader" className="canvas-file-date">수정한 날짜</span><span role="columnheader" className="canvas-file-kind">유형</span><span role="columnheader">위치 · 동작</span></div>
                        <div role="rowgroup">{visibleDocuments.map(canvasRow)}</div>
                    </div>
                    {visibleDocuments.length === 0 && <div className="canvas-library-empty"><Folder size={35} strokeWidth={1.2} /><h3>{search ? '일치하는 파일이 없습니다.' : '이 위치에 파일이 없습니다.'}</h3><p>{search ? '다른 이름으로 검색해 보세요.' : '새 노트·캔버스를 만들거나 폴더로 이동해 보세요.'}</p></div>}
                </section>}
                <footer className="canvas-library-status">{locationName}<span>{visibleDocuments.length}개 항목</span></footer>
            </main>
        </div>
    </section>;
}
