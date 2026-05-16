import axios from "axios";
import { API_BASE_URL2, authHeaders } from "../../../shared/api";

const getTasksData = async () => {
    try {
            const response = await axios.get(`${API_BASE_URL2}/api/tasks`, {
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
