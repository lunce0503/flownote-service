import axios from "axios";
import { API_CORE_BASE_URL, authHeaders } from "@/shared/api";
import type { TaskProps } from "../model/types";

// 1. 수정할 데이터를 인자(updateData)로 받도록 수정
const updateTaskData = async (id: string, updateData: Partial<TaskProps>) => {
    try {
        // 2. axios.patch의 두 번째 인자로 데이터를 전달합니다.
        const response = await axios.patch(
            `${API_CORE_BASE_URL}/api/tasks/${id}`, 
            updateData,
            { headers: authHeaders() }
        );
        
        console.log("updated task:", response.data);
        return response.data;
    } catch (error: any) {
        // 상세한 에러 로그 확인
        console.error("Error updating tasks:", error.response?.data || error.message);
        throw error;
    }
};

export default updateTaskData;
