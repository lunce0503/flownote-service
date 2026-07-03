import axios from "axios";
import { API_CORE_BASE_URL, authHeaders } from "../../shared/api";
import type { BlockDataProps } from "./model/types";

const normalizeNotesResponse = (data: unknown): BlockDataProps[] => {
    if (Array.isArray(data)) {
        return data as BlockDataProps[];
    }

    if (data && typeof data === "object" && Array.isArray((data as { notes?: unknown }).notes)) {
        return (data as { notes: BlockDataProps[] }).notes;
    }

    return [];
};

const getNoteData = async (): Promise<BlockDataProps[]> => {
    if (!API_CORE_BASE_URL) {
        console.warn("노트 API 기본 URL이 설정되지 않아 빈 노트 목록을 사용합니다.");
        return [];
    }

    try {
        const response = await axios.get<unknown>(`${API_CORE_BASE_URL}/api/notes`, {
            headers: authHeaders(),
        });
        const notes = normalizeNotesResponse(response.data);

        if (notes.length === 0 && !Array.isArray(response.data)) {
            console.warn("노트 API가 배열이 아닌 응답을 반환했습니다.", {
                contentType: response.headers["content-type"],
                dataType: typeof response.data,
            });
        }

        return notes;
    } catch (error) {
        console.error("Error fetching notes:", error);
        return [];
    }
};

export default getNoteData;
