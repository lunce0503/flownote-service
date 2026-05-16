import axios from "axios";
import { API_CORE_BASE_URL, authHeaders } from "../../../shared/api";

const getTasksData = async () => {
    try {
            const response = await axios.get(`${API_CORE_BASE_URL}/api/tasks`, {
                headers: authHeaders(),
            });
            console.log("Fetched tasks:", response.data);
            return response.data;
        } catch (error) {
            console.error("Error fetching tasks:", error);
            return [];
        }
};

export default getTasksData;
