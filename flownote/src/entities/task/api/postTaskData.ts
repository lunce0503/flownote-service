import axios from "axios";
import { API_BASE_URL2, authHeaders } from "../../../shared/api";
import type { TaskProps } from "../../../widgets/TaskWidget/TaskEliment";

const postTaskData = async (taskData: TaskProps) => {
    try {
        const response = await axios.post(`${API_BASE_URL2}/api/tasks`, taskData, {
            headers: authHeaders(),
        });
        console.log('Task posted successfully:', response.data);
    } catch (error) {
        console.error('Error posting task:', error);
    }   
};
export default postTaskData;
