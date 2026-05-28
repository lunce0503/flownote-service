import { useEffect, useMemo, useState, type DragEvent } from "react";
import { Link } from "react-router-dom";
import { Check, Folder, MoreVertical, Pencil, Plus, Trash2, X } from "lucide-react";
import getNoteData from "../../../entities/blog/getNoteData";
import postNoteData from "../../../entities/blog/postNoteData";
import { deleteNote, updateNoteTitle } from "../../../entities/blog/noteDataActions";
import {
  addNoteToFolder,
  createNoteFolder,
  deleteNoteFolder,
  getNoteFolders,
  removeNoteFromFolder,
  updateNoteFolder,
  type NoteFolder,
} from "../../../entities/blog/noteFolderData";
import {
  BLOG_COLLAPSED_FOLDERS_STORAGE_KEY,
  EMPTY_BLOG_FOLDER_FORM,
  buildNoteFolderIdByNoteId,
  createBlankNote,
  getNotePreview,
  getUnfiledNotes,
  groupNoteFoldersByCategory,
  type BlogNote,
  type FolderForm,
} from "../../../features/blog/model/blogListModel";
import { useLocalStorageStringSet } from "../../../shared/lib/useLocalStorageStringSet";
import { subscribeSyncEvents } from "../../../shared/sync";

const BlogList = () => {
  const [blogList, setBlogList] = useState<BlogNote[]>([]);
  const [folders, setFolders] = useState<NoteFolder[]>([]);
  const [folderForm, setFolderForm] = useState<FolderForm>(EMPTY_BLOG_FOLDER_FORM);
  const [editingFolderId, setEditingFolderId] = useState<string | null>(null);
  const [editingForm, setEditingForm] = useState<FolderForm>(EMPTY_BLOG_FOLDER_FORM);
  const [openMenuId, setOpenMenuId] = useState<string | null>(null);
  const [collapsedFolderIds, setCollapsedFolderIds] = useLocalStorageStringSet(BLOG_COLLAPSED_FOLDERS_STORAGE_KEY);
  const [openNoteMenuId, setOpenNoteMenuId] = useState<string | null>(null);
  const [editingNoteId, setEditingNoteId] = useState<string | null>(null);
  const [editingNoteTitle, setEditingNoteTitle] = useState<string>("");
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void handleBlogList();
  }, []);

  useEffect(() => subscribeSyncEvents((event) => {
    if (event.resource === "notes" || event.resource === "all") {
      void handleBlogList();
    }
  }), []);

  const noteFolderIdByNoteId = useMemo(() => buildNoteFolderIdByNoteId(folders), [folders]);

  const unfiledNotes = useMemo(
    () => getUnfiledNotes(blogList, noteFolderIdByNoteId),
    [blogList, noteFolderIdByNoteId],
  );

  const foldersByCategory = useMemo(() => groupNoteFoldersByCategory(folders), [folders]);

  const handleBlogList = async () => {
    setLoading(true);
    setError(null);
    try {
      const [notes, noteFolders] = await Promise.all([getNoteData(), getNoteFolders()]);
      setBlogList(Array.isArray(notes) ? notes : []);
      setFolders(Array.isArray(noteFolders) ? noteFolders : []);
    } catch (err) {
      console.error("Failed to fetch blog data:", err);
      setError("데이터를 불러오는 중 오류가 발생했습니다.");
    } finally {
      setLoading(false);
    }
  };

  const addBlogNote = async (folderId?: string) => {
    const blankNote = createBlankNote(`새 노트_${new Date().getTime()}`);
    setBlogList((prev) => [blankNote as BlogNote, ...prev]);

    try {
      await postNoteData(blankNote);
      if (folderId) {
        const updatedFolder = await addNoteToFolder(folderId, blankNote.id);
        replaceFolder(updatedFolder);
      }
    } catch (err) {
      console.error("Failed to create blog note:", err);
      setError("노트를 생성하는 중 오류가 발생했습니다.");
    }
  };

  const handleCreateFolder = async () => {
    if (!folderForm.name.trim()) return;

    try {
      const created = await createNoteFolder({
        category: folderForm.category,
        name: folderForm.name,
      });
      setFolders((prev) => [created, ...prev]);
      setFolderForm(EMPTY_BLOG_FOLDER_FORM);
    } catch (err) {
      console.error("Failed to create note folder:", err);
      setError("폴더를 생성하는 중 오류가 발생했습니다.");
    }
  };

  const handleUpdateFolder = async (folderId: string) => {
    if (!editingForm.name.trim()) return;

    try {
      const updated = await updateNoteFolder(folderId, editingForm);
      replaceFolder(updated);
      setEditingFolderId(null);
      setOpenMenuId(null);
    } catch (err) {
      console.error("Failed to update note folder:", err);
      setError("폴더를 수정하는 중 오류가 발생했습니다.");
    }
  };

  const handleDeleteFolder = async (folderId: string) => {
    try {
      await deleteNoteFolder(folderId);
      setFolders((prev) => prev.filter((folder) => folder.id !== folderId));
      setOpenMenuId(null);
    } catch (err) {
      console.error("Failed to delete note folder:", err);
      setError("폴더를 삭제하는 중 오류가 발생했습니다.");
    }
  };

  const handleUpdateNoteTitle = async (noteId: string) => {
    const title = editingNoteTitle.trim();
    if (!title) return;

    try {
      const updated = await updateNoteTitle(noteId, title);
      setBlogList((prev) => prev.map((note) => (note.id === noteId ? { ...note, title: updated.title } : note)));
      setEditingNoteId(null);
      setOpenNoteMenuId(null);
    } catch (err) {
      console.error("Failed to update note title:", err);
      setError("노트 이름을 수정하는 중 오류가 발생했습니다.");
    }
  };

  const handleDeleteNote = async (noteId: string) => {
    try {
      await deleteNote(noteId);
      setBlogList((prev) => prev.filter((note) => note.id !== noteId));
      setFolders((prev) => prev.map((folder) => ({
        ...folder,
        noteIds: folder.noteIds.filter((id) => id !== noteId),
      })));
      setOpenNoteMenuId(null);
    } catch (err) {
      console.error("Failed to delete note:", err);
      setError("노트를 삭제하는 중 오류가 발생했습니다.");
    }
  };

  const handleDropOnFolder = async (event: DragEvent<HTMLDivElement>, folderId: string) => {
    event.preventDefault();
    const noteId = event.dataTransfer.getData("text/plain");
    if (!noteId) return;

    try {
      const updated = await addNoteToFolder(folderId, noteId);
      setFolders((prev) => prev.map((folder) => (folder.id === updated.id ? updated : {
        ...folder,
        noteIds: folder.noteIds.filter((id) => id !== noteId),
      })));
    } catch (err) {
      console.error("Failed to move note into folder:", err);
      setError("노트를 폴더로 이동하는 중 오류가 발생했습니다.");
    }
  };

  const handleDropOnUnfiled = async (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    const noteId = event.dataTransfer.getData("text/plain");
    const folderId = noteFolderIdByNoteId.get(noteId);
    if (!noteId || !folderId) return;

    try {
      const updated = await removeNoteFromFolder(folderId, noteId);
      replaceFolder(updated);
    } catch (err) {
      console.error("Failed to remove note from folder:", err);
      setError("노트를 폴더에서 빼는 중 오류가 발생했습니다.");
    }
  };

  const beginEditFolder = (folder: NoteFolder) => {
    setEditingFolderId(folder.id);
    setEditingForm({
      category: folder.category,
      name: folder.name,
    });
    setOpenMenuId(null);
  };

  const beginEditNote = (note: BlogNote) => {
    setEditingNoteId(note.id);
    setEditingNoteTitle(note.title);
    setOpenNoteMenuId(null);
  };

  const toggleFolderCollapsed = (folderId: string) => {
    setCollapsedFolderIds((current) => {
      const next = new Set(current);
      if (next.has(folderId)) {
        next.delete(folderId);
      } else {
        next.add(folderId);
      }
      return next;
    });
  };

  const replaceFolder = (updated: NoteFolder) => {
    setFolders((prev) => prev.map((folder) => (folder.id === updated.id ? updated : folder)));
  };

  const noteCard = (note: BlogNote) => (
    <div
      draggable
      onDragStart={(event) => event.dataTransfer.setData("text/plain", note.id)}
      className="mb-2 w-full rounded-md border border-stone-200 bg-white text-black shadow-sm transition hover:border-stone-300 hover:bg-stone-50"
      key={note.id}
    >
      <div className="flex items-start gap-2 p-3">
        <div className="min-w-0 flex-1">
          {editingNoteId === note.id ? (
            <input
              className="mb-2 w-full rounded-md border border-stone-300 px-2 py-1 text-sm font-semibold text-stone-900"
              value={editingNoteTitle}
              onChange={(event) => setEditingNoteTitle(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  void handleUpdateNoteTitle(note.id);
                }
                if (event.key === "Escape") {
                  setEditingNoteId(null);
                }
              }}
              autoFocus
            />
          ) : (
            <Link to={`/blog/${encodeURIComponent(note.title)}`} className="block min-w-0">
              <h3 className="truncate font-semibold">{note.title}</h3>
            </Link>
          )}
          <span className="line-clamp-2 text-xs text-stone-500">{getNotePreview(note)}</span>
        </div>

        {editingNoteId === note.id ? (
          <div className="flex shrink-0 gap-1">
            <button
              className="inline-flex h-8 w-8 items-center justify-center rounded-md text-stone-700 hover:bg-stone-200"
              onClick={() => void handleUpdateNoteTitle(note.id)}
              title="노트 이름 저장"
            >
              <Check size={16} />
            </button>
            <button
              className="inline-flex h-8 w-8 items-center justify-center rounded-md text-stone-700 hover:bg-stone-200"
              onClick={() => setEditingNoteId(null)}
              title="노트 이름 수정 취소"
            >
              <X size={16} />
            </button>
          </div>
        ) : (
          <div className="relative shrink-0">
            <button
              className="inline-flex h-8 w-8 items-center justify-center rounded-md text-stone-700 hover:bg-stone-200"
              onClick={() => setOpenNoteMenuId((current) => (current === note.id ? null : note.id))}
              title="노트 메뉴"
            >
              <MoreVertical size={16} />
            </button>
            {openNoteMenuId === note.id && (
              <div className="absolute right-0 z-20 mt-1 w-36 overflow-hidden rounded-md border border-stone-200 bg-white text-sm text-black shadow-lg">
                <button
                  className="flex w-full items-center gap-2 px-3 py-2 text-left hover:bg-stone-100"
                  onClick={() => beginEditNote(note)}
                >
                  <Pencil size={14} />
                  이름 수정
                </button>
                <button
                  className="flex w-full items-center gap-2 px-3 py-2 text-left text-red-600 hover:bg-red-50"
                  onClick={() => void handleDeleteNote(note.id)}
                >
                  <Trash2 size={14} />
                  삭제
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );

  return (
    <div className="min-h-[calc(100vh-56px)] bg-stone-950 p-3 text-stone-900 md:p-5">
      <div className="mx-auto max-w-7xl rounded-2xl border border-stone-200 bg-stone-50 p-4 shadow-xl md:p-5">
      <div className="mb-4 flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
        <div>
          <p className="text-xs font-bold uppercase text-amber-700">Knowledge Stream</p>
          <h1 className="text-2xl font-black text-stone-950 md:text-3xl">게시글 관리</h1>
          <p className="text-sm text-stone-500">폴더, 최근 노트, 드로잉 필기를 한 화면에서 정리합니다.</p>
        </div>
        <div className="grid grid-cols-2 gap-2 text-center">
          <div className="rounded-xl bg-white px-4 py-3 shadow-sm">
            <div className="text-lg font-black">{blogList.length}</div>
            <div className="text-xs text-stone-500">노트</div>
          </div>
          <div className="rounded-xl bg-white px-4 py-3 shadow-sm">
            <div className="text-lg font-black">{folders.length}</div>
            <div className="text-xs text-stone-500">폴더</div>
          </div>
        </div>
      </div>

      <div className="mb-4 grid gap-2 rounded-lg border border-stone-200 p-3 md:grid-cols-[1fr_1fr_auto]">
        <input
          className="rounded-md border border-stone-300 px-3 py-2 text-sm text-stone-900"
          value={folderForm.category}
          onChange={(event) => setFolderForm((prev) => ({ ...prev, category: event.target.value }))}
          placeholder="카테고리"
        />
        <input
          className="rounded-md border border-stone-300 px-3 py-2 text-sm text-stone-900"
          value={folderForm.name}
          onChange={(event) => setFolderForm((prev) => ({ ...prev, name: event.target.value }))}
          placeholder="폴더 이름"
        />
        <button
          className="inline-flex items-center justify-center rounded-md bg-stone-900 px-3 py-2 text-sm font-semibold text-white hover:bg-stone-700 disabled:cursor-not-allowed disabled:bg-stone-300"
          onClick={handleCreateFolder}
          disabled={!folderForm.name.trim()}
          title="폴더 추가"
        >
          <Plus size={18} />
        </button>
      </div>

      {error && <p className="mb-3 rounded-md bg-red-50 p-3 text-sm text-red-700">{error}</p>}

      <div className="grid gap-4 lg:grid-cols-[minmax(280px,360px)_minmax(0,1fr)]">
        <div className="space-y-4">
          {Object.entries(foldersByCategory).map(([category, categoryFolders]) => (
            <section key={category}>
              <h2 className="mb-2 border-b border-stone-200 pb-1 text-xs font-bold uppercase tracking-wide text-stone-500">
                {category}
              </h2>
              <div className="space-y-3">
                {categoryFolders.map((folder) => {
                  const folderNoteIds = new Set(folder.noteIds);
                  const folderNotes = blogList.filter((note) => folderNoteIds.has(note.id));
                  const isEditing = editingFolderId === folder.id;
                  const isCollapsed = collapsedFolderIds.has(folder.id);

                  return (
                    <div
                      className="rounded-lg border border-stone-200 bg-stone-50 p-3"
                      key={folder.id}
                      onDragOver={(event) => event.preventDefault()}
                      onDrop={(event) => void handleDropOnFolder(event, folder.id)}
                    >
                      <div className="mb-2 flex items-start justify-between gap-2">
                        {isEditing ? (
                          <div className="grid flex-1 gap-2">
                            <input
                              className="rounded-md border border-stone-300 px-2 py-1 text-sm text-stone-900"
                              value={editingForm.category}
                              onChange={(event) => setEditingForm((prev) => ({ ...prev, category: event.target.value }))}
                              placeholder="카테고리"
                            />
                            <input
                              className="rounded-md border border-stone-300 px-2 py-1 text-sm text-stone-900"
                              value={editingForm.name}
                              onChange={(event) => setEditingForm((prev) => ({ ...prev, name: event.target.value }))}
                              placeholder="폴더 이름"
                            />
                          </div>
                        ) : (
                          <div className="flex min-w-0 items-center gap-2">
                            <button
                              className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-amber-600 hover:bg-amber-100"
                              onClick={() => toggleFolderCollapsed(folder.id)}
                              title={isCollapsed ? "폴더 펼치기" : "폴더 접기"}
                            >
                              <Folder size={18} />
                            </button>
                            <h3 className="truncate text-sm font-semibold text-stone-800">{folder.name}</h3>
                          </div>
                        )}

                        {isEditing ? (
                          <div className="flex shrink-0 gap-1">
                            <button
                              className="inline-flex h-8 w-8 items-center justify-center rounded-md text-stone-700 hover:bg-stone-200"
                              onClick={() => void handleUpdateFolder(folder.id)}
                              title="수정 완료"
                            >
                              <Check size={16} />
                            </button>
                            <button
                              className="inline-flex h-8 w-8 items-center justify-center rounded-md text-stone-700 hover:bg-stone-200"
                              onClick={() => setEditingFolderId(null)}
                              title="수정 취소"
                            >
                              <X size={16} />
                            </button>
                          </div>
                        ) : (
                          <div className="relative shrink-0">
                            <button
                              className="inline-flex h-8 w-8 items-center justify-center rounded-md text-stone-700 hover:bg-stone-200"
                              onClick={() => setOpenMenuId((current) => (current === folder.id ? null : folder.id))}
                              title="폴더 메뉴"
                            >
                              <MoreVertical size={16} />
                            </button>
                            {openMenuId === folder.id && (
                              <div className="absolute right-0 z-10 mt-1 w-36 overflow-hidden rounded-md border border-stone-200 bg-white text-sm text-black shadow-lg">
                                <button
                                  className="flex w-full items-center gap-2 px-3 py-2 text-left hover:bg-stone-100"
                                  onClick={() => beginEditFolder(folder)}
                                >
                                  <Pencil size={14} />
                                  수정
                                </button>
                                <button
                                  className="flex w-full items-center gap-2 px-3 py-2 text-left hover:bg-stone-100"
                                  onClick={() => void addBlogNote(folder.id)}
                                >
                                  <Plus size={14} />
                                  추가
                                </button>
                                <button
                                  className="flex w-full items-center gap-2 px-3 py-2 text-left text-red-600 hover:bg-red-50"
                                  onClick={() => void handleDeleteFolder(folder.id)}
                                >
                                  <Trash2 size={14} />
                                  삭제
                                </button>
                              </div>
                            )}
                          </div>
                        )}
                      </div>

                      {!isCollapsed && (
                        <div className="min-h-14 rounded-md border border-dashed border-stone-300 bg-white/70 p-2">
                          {folderNotes.length > 0 ? (
                            folderNotes.map(noteCard)
                          ) : (
                            <p className="py-4 text-center text-xs text-stone-500">노트를 드래그해서 넣으세요</p>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </section>
          ))}
        </div>

        <div
          className="rounded-lg border border-dashed border-stone-300 p-3"
          onDragOver={(event) => event.preventDefault()}
          onDrop={handleDropOnUnfiled}
        >
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-sm font-bold text-stone-700">최근 노트</h2>
            <button
              className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-stone-300 text-stone-700 hover:bg-stone-100"
              onClick={() => void addBlogNote()}
              title="노트 추가"
            >
              <Plus size={18} />
            </button>
          </div>

          {unfiledNotes.length > 0 ? (
            unfiledNotes.map(noteCard)
          ) : (
            !loading && <p className="py-8 text-center text-sm text-stone-500">작성된 글이 없습니다</p>
          )}
        </div>
      </div>
      </div>
    </div>
  );
};

export default BlogList;
