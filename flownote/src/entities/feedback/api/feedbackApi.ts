import axios from "axios";
import { API_CORE_BASE_URL, authHeaders } from "@/shared/api";
import type { FeedbackInput, FeedbackItem } from "../model/types";

const normalizeList = (data: unknown): FeedbackItem[] => (
  Array.isArray(data) ? (data as FeedbackItem[]) : []
);

/** 피드백을 서버(DB)에 저장한다. */
export const postFeedback = async (input: FeedbackInput): Promise<FeedbackItem> => {
  if (!API_CORE_BASE_URL) {
    throw new Error("피드백 API 기본 URL이 설정되지 않았습니다.");
  }
  const response = await axios.post<FeedbackItem>(
    `${API_CORE_BASE_URL}/api/feedback`,
    {
      category: input.category,
      message: input.message,
      contact: input.contact,
    },
    { headers: authHeaders() },
  );
  return response.data;
};

/** 내가 보낸 피드백 목록(최신순). */
export const listMyFeedback = async (): Promise<FeedbackItem[]> => {
  if (!API_CORE_BASE_URL) return [];
  const response = await axios.get<unknown>(`${API_CORE_BASE_URL}/api/feedback`, {
    headers: authHeaders(),
  });
  return normalizeList(response.data);
};

/** 관리자 전용 전체 피드백 조회. */
export const listAllFeedback = async (): Promise<FeedbackItem[]> => {
  if (!API_CORE_BASE_URL) return [];
  const response = await axios.get<unknown>(`${API_CORE_BASE_URL}/api/feedback/all`, {
    headers: authHeaders(),
  });
  return normalizeList(response.data);
};
