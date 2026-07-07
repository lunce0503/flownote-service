import axios from "axios";
import { API_CORE_BASE_URL, authHeaders } from "@/shared/api";
import { getSyncClientId, publishSyncEvent } from "@/shared/lib/sync";
import type { BlockDataProps } from "../model/types";

const updateNoteTitle = async (
  noteId: string,
  title: string,
  syncDetails: { revision: number; clientId?: string },
) => {
  if (!API_CORE_BASE_URL) {
    throw new Error("노트 API 기본 URL이 설정되지 않았습니다.");
  }

  const clientId = syncDetails.clientId ?? getSyncClientId();
  const response = await axios.patch<BlockDataProps>(
    `${API_CORE_BASE_URL}/api/notes/${noteId}`,
    { title, revision: syncDetails.revision, client_id: clientId },
    { headers: authHeaders() },
  );
  void publishSyncEvent("notes", "note-title-updated", {
    noteId,
    revision: syncDetails.revision,
    clientId,
  });
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
