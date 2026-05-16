import axios from "axios";
import { API_BASE_URL2, authHeaders } from "../../shared/api";
import type { BlockDataProps } from "../../widgets/BlogWidget/BlockNote/BlockNote";

const postNoteData = async (noteData: BlockDataProps) => {
    try {
        const response = await axios.post(`${API_BASE_URL2}/api/notes`, noteData, {
            headers: authHeaders(),
        });
        console.log('Task posted successfully:', response.data);
    } catch (error) {
        console.error('Error posting task:', error);
    }   
};
export default postNoteData;
