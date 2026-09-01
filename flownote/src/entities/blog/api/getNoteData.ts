import axios from "axios";
import { API_CORE_BASE_URL, authHeaders } from "@/shared/api";
import type { BlockDataProps } from "../model/types";

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
        throw new Error("노트 API 기본 URL이 설정되지 않았습니다.");
    }

    try {
        const response = await axios.get<unknown>(`${API_CORE_BASE_URL}/api/notes`, {
            headers: authHeaders(),
        });
        const hasNotesEnvelope = Boolean(
            response.data
            && typeof response.data === "object"
            && Array.isArray((response.data as { notes?: unknown }).notes),
        );

        if (!Array.isArray(response.data) && !hasNotesEnvelope) {
            console.error("노트 API가 지원하지 않는 응답을 반환했습니다.", {
                contentType: response.headers["content-type"],
                dataType: typeof response.data,
            });
            throw new Error("노트 API 응답 형식이 올바르지 않습니다.");
        }

        return normalizeNotesResponse(response.data);
    } catch (error) {
        console.error("Error fetching notes:", error);
        throw error;
    }
};

export default getNoteData;
