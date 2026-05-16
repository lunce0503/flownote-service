import axios from "axios";
import { API_CORE_BASE_URL, authHeaders } from "../../shared/api";

const getNoteData = async () => {
    try {
        const response = await axios.get(`${API_CORE_BASE_URL}/api/notes`, {
            headers: authHeaders(),
        });
        console.log("Fetched notes:", response.data);
        return response.data;
    } catch (error) {
        console.error("Error fetching notes:", error);
        return [];
    }
};

export default getNoteData;
