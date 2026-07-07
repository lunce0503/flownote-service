import axios from "axios";
import { API_CORE_BASE_URL, authHeaders } from "@/shared/api";
import { getSyncClientId, publishSyncEvent } from "@/shared/lib/sync";
import type { BlockDataProps } from "../model/types";

const postNoteData = async (noteData: BlockDataProps) => {
    if (!API_CORE_BASE_URL) {
        throw new Error("노트 API 기본 URL이 설정되지 않았습니다.");
    }

    try {
        const requestData = {
            ...noteData,
            revision: noteData.revision ?? 1,
            client_id: noteData.client_id ?? getSyncClientId(),
        };
        const response = await axios.post<BlockDataProps>(`${API_CORE_BASE_URL}/api/notes`, requestData, {
            headers: authHeaders(),
        });
        if (response.data.revision === requestData.revision) {
            void publishSyncEvent("notes", "note-saved", {
                noteId: response.data.id,
                revision: response.data.revision,
                clientId: requestData.client_id,
            });
        }
        return response.data;
    } catch (error) {
        console.error('Error posting task:', error);
        throw error;
    }   
};
export default postNoteData;
