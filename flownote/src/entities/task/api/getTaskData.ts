import axios from "axios";
import { API_CORE_BASE_URL, authHeaders } from "../../../shared/api";
import type { TaskProps } from "../model/types";

const normalizeTasksResponse = (data: unknown): TaskProps[] => {
    const normalizeTask = (task: TaskProps): TaskProps => ({
        ...task,
        tags: Array.isArray(task.tags) ? task.tags : [],
        links: Array.isArray(task.links) ? task.links : [],
        time_logs: Array.isArray(task.time_logs) ? task.time_logs : [],
    });

    if (Array.isArray(data)) {
        return (data as TaskProps[]).map(normalizeTask);
    }

    if (data && typeof data === "object" && Array.isArray((data as { tasks?: unknown }).tasks)) {
        return (data as { tasks: TaskProps[] }).tasks.map(normalizeTask);
    }

    return [];
};

const getTasksData = async (): Promise<TaskProps[]> => {
    if (!API_CORE_BASE_URL) {
        console.warn("작업 API 기본 URL이 설정되지 않아 빈 작업 목록을 사용합니다.");
        return [];
    }

    try {
            const response = await axios.get(`${API_CORE_BASE_URL}/api/tasks`, {
                headers: authHeaders(),
            });
            const tasks = normalizeTasksResponse(response.data);

            if (tasks.length === 0 && !Array.isArray(response.data)) {
                console.warn("작업 API가 배열이 아닌 응답을 반환했습니다.", {
                    contentType: response.headers["content-type"],
                    dataType: typeof response.data,
                });
            }

            return tasks;
        } catch (error) {
            console.error("Error fetching tasks:", error);
            return [];
        }
};

export default getTasksData;
