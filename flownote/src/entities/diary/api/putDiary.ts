import axios from "axios";
import { API_CORE_BASE_URL, authHeaders } from "@/shared/api";
import type { DiaryEntry, DiaryGrid, DiaryJournalBlock, DiaryTodo } from "../model/types";
import { normalizeDiaryGrid } from "../model/types";

type DiaryPayload = {
  todos: DiaryTodo[];
  grid: DiaryGrid;
  journal: DiaryJournalBlock[];
};

// 날짜별 일기를 upsert 저장한다.
const putDiary = async (date: string, payload: DiaryPayload): Promise<DiaryEntry> => {
  const response = await axios.put(`${API_CORE_BASE_URL}/api/diary/${date}`, payload, {
    headers: authHeaders(),
  });
  const data = response.data ?? {};
  return {
    id: data.id,
    entry_date: data.entry_date ?? date,
    todos: Array.isArray(data.todos) ? data.todos : payload.todos,
    grid: normalizeDiaryGrid(data.grid),
    journal: Array.isArray(data.journal) ? data.journal : payload.journal,
    created_at: data.created_at,
    updated_at: data.updated_at,
  };
};

export default putDiary;
export type { DiaryPayload };
