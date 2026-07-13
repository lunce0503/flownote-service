import axios from "axios";
import { API_CORE_BASE_URL, authHeaders } from "@/shared/api";
import { publishSyncEvent } from "@/shared/lib/sync";

type NoteFolder = {
  id: string;
  category: string;
  name: string;
  noteIds: string[];
  created_at?: string;
  updated_at?: string;
};

type NoteFolderPayload = {
  category: string;
  name: string;
  noteIds?: string[];
};

type NoteFolderResponse = Omit<NoteFolder, "noteIds"> & {
  note_ids?: string[];
  noteIds?: string[];
};

const toRequestBody = (payload: Partial<NoteFolderPayload>) => ({
  ...payload,
  note_ids: payload.noteIds,
  noteIds: undefined,
});

const normalizeFolder = (folder: NoteFolderResponse): NoteFolder => ({
  ...folder,
  noteIds: folder.noteIds ?? folder.note_ids ?? [],
});

const normalizeFoldersResponse = (data: unknown): NoteFolder[] => {
  if (Array.isArray(data)) {
    return (data as NoteFolderResponse[]).map(normalizeFolder);
  }

  if (data && typeof data === "object" && Array.isArray((data as { folders?: unknown }).folders)) {
    return ((data as { folders: NoteFolderResponse[] }).folders).map(normalizeFolder);
  }

  if (data && typeof data === "object" && Array.isArray((data as { noteFolders?: unknown }).noteFolders)) {
    return ((data as { noteFolders: NoteFolderResponse[] }).noteFolders).map(normalizeFolder);
  }

  return [];
};

const getNoteFolders = async (): Promise<NoteFolder[]> => {
  if (!API_CORE_BASE_URL) {
    console.warn("노트 폴더 API 기본 URL이 설정되지 않아 빈 폴더 목록을 사용합니다.");
    return [];
  }

  const response = await axios.get<unknown>(`${API_CORE_BASE_URL}/api/note-folders`, {
    headers: authHeaders(),
  });
  const folders = normalizeFoldersResponse(response.data);

  if (folders.length === 0 && !Array.isArray(response.data)) {
    console.warn("노트 폴더 API가 배열이 아닌 응답을 반환했습니다.", {
      contentType: response.headers["content-type"],
      dataType: typeof response.data,
    });
  }

  return folders;
};

const createNoteFolder = async (payload: NoteFolderPayload): Promise<NoteFolder> => {
  if (!API_CORE_BASE_URL) {
    throw new Error("노트 폴더 API 기본 URL이 설정되지 않았습니다.");
  }

  const response = await axios.post(`${API_CORE_BASE_URL}/api/note-folders`, toRequestBody(payload), {
    headers: authHeaders(),
  });
  void publishSyncEvent("notes", "folder-created");
  return normalizeFolder(response.data);
};

const updateNoteFolder = async (
  folderId: string,
  payload: Partial<NoteFolderPayload>,
): Promise<NoteFolder> => {
  if (!API_CORE_BASE_URL) {
    throw new Error("노트 폴더 API 기본 URL이 설정되지 않았습니다.");
  }

  const response = await axios.patch(`${API_CORE_BASE_URL}/api/note-folders/${folderId}`, toRequestBody(payload), {
    headers: authHeaders(),
  });
  void publishSyncEvent("notes", "folder-updated");
  return normalizeFolder(response.data);
};

const deleteNoteFolder = async (folderId: string) => {
  if (!API_CORE_BASE_URL) {
    throw new Error("노트 폴더 API 기본 URL이 설정되지 않았습니다.");
  }

  await axios.delete(`${API_CORE_BASE_URL}/api/note-folders/${folderId}`, {
    headers: authHeaders(),
  });
  void publishSyncEvent("notes", "folder-deleted");
};

const addNoteToFolder = async (folderId: string, noteId: string): Promise<NoteFolder> => {
  if (!API_CORE_BASE_URL) {
    throw new Error("노트 폴더 API 기본 URL이 설정되지 않았습니다.");
  }

  const response = await axios.post(`${API_CORE_BASE_URL}/api/note-folders/${folderId}/notes/${noteId}`, null, {
    headers: authHeaders(),
  });
  void publishSyncEvent("notes", "folder-note-added");
  return normalizeFolder(response.data);
};

const removeNoteFromFolder = async (folderId: string, noteId: string): Promise<NoteFolder> => {
  if (!API_CORE_BASE_URL) {
    throw new Error("노트 폴더 API 기본 URL이 설정되지 않았습니다.");
  }

  const response = await axios.delete(`${API_CORE_BASE_URL}/api/note-folders/${folderId}/notes/${noteId}`, {
    headers: authHeaders(),
  });
  void publishSyncEvent("notes", "folder-note-removed");
  return normalizeFolder(response.data);
};

export {
  addNoteToFolder,
  createNoteFolder,
  deleteNoteFolder,
  getNoteFolders,
  removeNoteFromFolder,
  updateNoteFolder,
};
export type { NoteFolder, NoteFolderPayload };
