import axios from "axios";
import { API_CORE_BASE_URL, authHeaders } from "@/shared/api";
import type { DiaryEntry } from "../model/types";
import { normalizeDiaryGrid } from "../model/types";

// 특정 날짜(YYYY-MM-DD)의 일기를 불러온다. 없으면 서버가 빈 일기를 200으로 돌려준다.
const getDiary = async (date: string): Promise<DiaryEntry> => {
  const response = await axios.get(`${API_CORE_BASE_URL}/api/diary`, {
    params: { date },
    headers: authHeaders(),
  });
  const data = response.data ?? {};
  return {
    id: data.id,
    entry_date: data.entry_date ?? date,
    todos: Array.isArray(data.todos) ? data.todos : [],
    grid: normalizeDiaryGrid(data.grid),
    journal: Array.isArray(data.journal) ? data.journal : [],
    created_at: data.created_at,
    updated_at: data.updated_at,
  };
};

export default getDiary;
