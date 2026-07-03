import axios from "axios";
import { API_CORE_BASE_URL, authHeaders } from "../../shared/api";
import type { BlockDataProps } from "./model/types";

const updateNoteData = async (title: string, updatenoteData: BlockDataProps) => {
    if (!API_CORE_BASE_URL) {
        throw new Error("노트 API 기본 URL이 설정되지 않았습니다.");
    }

    try {
        const response = await axios.patch(
            `${API_CORE_BASE_URL}/api/notes/${title}`
            , updatenoteData,
            { headers: authHeaders() }
        );
        console.log("updated note:", response.data);
        return response.data;
    } catch (error) {
        console.error('Error updating note:', error);
        throw error;
    }   
};
export default updateNoteData;
