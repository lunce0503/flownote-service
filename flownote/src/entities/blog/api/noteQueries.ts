import axios from 'axios';
import { API_CORE_BASE_URL, authHeaders } from '@/shared/api';
import type { BlockDataProps, NoteSummary } from '../model/types';
import { isMarkdown } from '../model/markdown';
import { collectNoteSummaries, type NoteSummaryPage } from '../model/noteQueries';

export const getNoteSummaries = (signal?: AbortSignal, onPage?: (notes: NoteSummary[]) => void) => collectNoteSummaries(async cursor => {
  const response = await axios.get<NoteSummaryPage>(`${API_CORE_BASE_URL}/api/notes`, {
    params: { view: 'summary', limit: 50, cursor }, headers: authHeaders(), signal,
  });
  return response.data;
}, onPage);
export const getNote = async (id: string, signal?: AbortSignal): Promise<BlockDataProps> => {
  const response = await axios.get<BlockDataProps>(`${API_CORE_BASE_URL}/api/notes/${encodeURIComponent(id)}`, {
    headers: authHeaders(), signal,
  });
  if (response.data.id !== id || (!Array.isArray(response.data.content) && !isMarkdown(response.data.content))) {
    throw new Error('지원하지 않는 노트 본문입니다. 원본을 변경하지 않았습니다.');
  }
  return response.data;
};
