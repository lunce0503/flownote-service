import axios from "axios";
import { API_CORE_BASE_URL, authHeaders } from "../../shared/api";
import type { BlockDataProps } from "./model/types";

const updateNoteData = async (title: string, updatenoteData: BlockDataProps) => {
    try {
        const response = await axios.patch(`
            ${API_CORE_BASE_URL}/api/notes/${title}`
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
