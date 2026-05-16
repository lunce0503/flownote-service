import axios from "axios";
import { API_CORE_BASE_URL, authHeaders } from "../../shared/api";
import type { BlockDataProps } from "./model/types";

const postNoteData = async (noteData: BlockDataProps) => {
    try {
        const response = await axios.post(`${API_CORE_BASE_URL}/api/notes`, noteData, {
            headers: authHeaders(),
        });
        console.log('Task posted successfully:', response.data);
        return response.data;
    } catch (error) {
        console.error('Error posting task:', error);
        throw error;
    }   
};
export default postNoteData;
