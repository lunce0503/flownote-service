import axios from "axios";
import { API_CORE_BASE_URL, authHeaders } from "@/shared/api";

// 일기가 존재하는 날짜 목록(최신순).
const getDiaryDates = async (): Promise<string[]> => {
  const response = await axios.get(`${API_CORE_BASE_URL}/api/diary/dates`, {
    headers: authHeaders(),
  });
  return Array.isArray(response.data) ? response.data.filter((d): d is string => typeof d === "string") : [];
};

export default getDiaryDates;
