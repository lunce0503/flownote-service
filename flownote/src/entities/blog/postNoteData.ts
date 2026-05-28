import axios from "axios";
import { API_CORE_BASE_URL, authHeaders } from "../../shared/api";
import { publishSyncEvent } from "../../shared/sync";
import type { BlockDataProps } from "./model/types";

const postNoteData = async (noteData: BlockDataProps) => {
    if (!API_CORE_BASE_URL) {
        throw new Error("노트 API 기본 URL이 설정되지 않았습니다.");
    }

    try {
        const response = await axios.post(`${API_CORE_BASE_URL}/api/notes`, noteData, {
            headers: authHeaders(),
        });
        void publishSyncEvent("notes", "note-saved");
        console.log('Task posted successfully:', response.data);
        return response.data;
    } catch (error) {
        console.error('Error posting task:', error);
        throw error;
    }   
};
export default postNoteData;
