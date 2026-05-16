import axios from "axios";
import { API_BASE_URL2, authHeaders } from "../../../shared/api";

const updateTasksData = async (id : string) => {
    try {
            const response = await axios.delete(`${API_BASE_URL2}/api/tasks/${id}`, {
                headers: authHeaders(),
            });
            console.log("deleted task:", response.data);
        } catch (error) {
            console.error("Error fetching tasks:", error);
        }
};

export default updateTasksData;
