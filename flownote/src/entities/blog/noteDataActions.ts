import axios from "axios";
import { API_CORE_BASE_URL, authHeaders } from "../../shared/api";
import { publishSyncEvent } from "../../shared/sync";

const updateNoteTitle = async (noteId: string, title: string) => {
  if (!API_CORE_BASE_URL) {
    throw new Error("노트 API 기본 URL이 설정되지 않았습니다.");
  }

  const response = await axios.patch(
    `${API_CORE_BASE_URL}/api/notes/${noteId}`,
    { title },
    { headers: authHeaders() },
  );
  void publishSyncEvent("notes", "note-title-updated");
  return response.data;
};

const deleteNote = async (noteId: string) => {
  if (!API_CORE_BASE_URL) {
    throw new Error("노트 API 기본 URL이 설정되지 않았습니다.");
  }

  const response = await axios.delete(`${API_CORE_BASE_URL}/api/notes/${noteId}`, {
    headers: authHeaders(),
  });
  void publishSyncEvent("notes", "note-deleted");
  return response.data;
};

export { deleteNote, updateNoteTitle };
