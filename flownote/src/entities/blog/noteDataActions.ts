import axios from "axios";
import { API_CORE_BASE_URL, authHeaders } from "../../shared/api";

const updateNoteTitle = async (noteId: string, title: string) => {
  const response = await axios.patch(
    `${API_CORE_BASE_URL}/api/notes/${noteId}`,
    { title },
    { headers: authHeaders() },
  );
  return response.data;
};

const deleteNote = async (noteId: string) => {
  const response = await axios.delete(`${API_CORE_BASE_URL}/api/notes/${noteId}`, {
    headers: authHeaders(),
  });
  return response.data;
};

export { deleteNote, updateNoteTitle };
