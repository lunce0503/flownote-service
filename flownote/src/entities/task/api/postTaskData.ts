import axios from "axios";
import { API_CORE_BASE_URL, authHeaders } from "../../../shared/api";
import type { TaskProps } from "../model/types";

const postTaskData = async (taskData: TaskProps) => {
    try {
        const response = await axios.post(`${API_CORE_BASE_URL}/api/tasks`, taskData, {
            headers: authHeaders(),
        });
        console.log('Task posted successfully:', response.data);
        return response.data;
    } catch (error) {
        console.error('Error posting task:', error);
        throw error;
    }   
};
export default postTaskData;
