import axios from "axios";
import { API_CORE_BASE_URL, authHeaders } from "../../shared/api";

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

const getNoteFolders = async (): Promise<NoteFolder[]> => {
  const response = await axios.get(`${API_CORE_BASE_URL}/api/note-folders`, {
    headers: authHeaders(),
  });
  return response.data.map(normalizeFolder);
};

const createNoteFolder = async (payload: NoteFolderPayload): Promise<NoteFolder> => {
  const response = await axios.post(`${API_CORE_BASE_URL}/api/note-folders`, toRequestBody(payload), {
    headers: authHeaders(),
  });
  return normalizeFolder(response.data);
};

const updateNoteFolder = async (
  folderId: string,
  payload: Partial<NoteFolderPayload>,
): Promise<NoteFolder> => {
  const response = await axios.patch(`${API_CORE_BASE_URL}/api/note-folders/${folderId}`, toRequestBody(payload), {
    headers: authHeaders(),
  });
  return normalizeFolder(response.data);
};

const deleteNoteFolder = async (folderId: string) => {
  await axios.delete(`${API_CORE_BASE_URL}/api/note-folders/${folderId}`, {
    headers: authHeaders(),
  });
};

const addNoteToFolder = async (folderId: string, noteId: string): Promise<NoteFolder> => {
  const response = await axios.post(`${API_CORE_BASE_URL}/api/note-folders/${folderId}/notes/${noteId}`, null, {
    headers: authHeaders(),
  });
  return normalizeFolder(response.data);
};

const removeNoteFromFolder = async (folderId: string, noteId: string): Promise<NoteFolder> => {
  const response = await axios.delete(`${API_CORE_BASE_URL}/api/note-folders/${folderId}/notes/${noteId}`, {
    headers: authHeaders(),
  });
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
