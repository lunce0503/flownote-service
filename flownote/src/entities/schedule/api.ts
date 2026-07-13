import axios from "axios";
import { API_CORE_BASE_URL, authHeaders } from "@/shared/api";
import type { ScheduleItem, ScheduleItemInput } from "./model/types";

const toRequestBody = (input: ScheduleItemInput) => ({
  title: input.title,
  days_of_week: input.daysOfWeek,
  start_time: input.startTime,
  end_time: input.endTime,
  category: input.category,
  color: input.color,
  memo: input.memo,
  is_active: input.isActive,
});

const normalizeScheduleItemsResponse = (data: unknown): ScheduleItem[] => {
  if (Array.isArray(data)) {
    return data as ScheduleItem[];
  }

  if (data && typeof data === "object" && Array.isArray((data as { scheduleItems?: unknown }).scheduleItems)) {
    return (data as { scheduleItems: ScheduleItem[] }).scheduleItems;
  }

  if (data && typeof data === "object" && Array.isArray((data as { schedule_items?: unknown }).schedule_items)) {
    return (data as { schedule_items: ScheduleItem[] }).schedule_items;
  }

  return [];
};

export const listScheduleItems = async (): Promise<ScheduleItem[]> => {
  if (!API_CORE_BASE_URL) {
    console.warn("시간표 API 기본 URL이 설정되지 않아 빈 시간표 목록을 사용합니다.");
    return [];
  }

  const response = await axios.get<unknown>(`${API_CORE_BASE_URL}/api/schedule-items`, {
    headers: authHeaders(),
  });
  const items = normalizeScheduleItemsResponse(response.data);

  if (items.length === 0 && !Array.isArray(response.data)) {
    console.warn("시간표 API가 배열이 아닌 응답을 반환했습니다.", {
      contentType: response.headers["content-type"],
      dataType: typeof response.data,
    });
  }

  return items;
};

export const createScheduleItem = async (input: ScheduleItemInput) => {
  if (!API_CORE_BASE_URL) {
    throw new Error("시간표 API 기본 URL이 설정되지 않았습니다.");
  }

  const response = await axios.post<ScheduleItem>(
    `${API_CORE_BASE_URL}/api/schedule-items`,
    toRequestBody(input),
    { headers: authHeaders() },
  );
  return response.data;
};

export const updateScheduleItem = async (id: string, input: ScheduleItemInput) => {
  if (!API_CORE_BASE_URL) {
    throw new Error("시간표 API 기본 URL이 설정되지 않았습니다.");
  }

  const response = await axios.patch<{ updatedScheduleItem?: ScheduleItem; updated_schedule_item?: ScheduleItem }>(
    `${API_CORE_BASE_URL}/api/schedule-items/${id}`,
    toRequestBody(input),
    { headers: authHeaders() },
  );
  return response.data.updatedScheduleItem ?? response.data.updated_schedule_item;
};

export const deleteScheduleItem = async (id: string) => {
  if (!API_CORE_BASE_URL) {
    throw new Error("시간표 API 기본 URL이 설정되지 않았습니다.");
  }

  const response = await axios.delete<{ deletedScheduleItem?: ScheduleItem; deleted_schedule_item?: ScheduleItem }>(
    `${API_CORE_BASE_URL}/api/schedule-items/${id}`,
    { headers: authHeaders() },
  );
  return response.data.deletedScheduleItem ?? response.data.deleted_schedule_item;
};
