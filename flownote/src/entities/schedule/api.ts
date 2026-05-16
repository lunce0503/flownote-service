import axios from "axios";
import { API_CORE_BASE_URL, authHeaders } from "../../shared/api";
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

export const listScheduleItems = async () => {
  const response = await axios.get<ScheduleItem[]>(`${API_CORE_BASE_URL}/api/schedule-items`, {
    headers: authHeaders(),
  });
  return response.data;
};

export const createScheduleItem = async (input: ScheduleItemInput) => {
  const response = await axios.post<ScheduleItem>(
    `${API_CORE_BASE_URL}/api/schedule-items`,
    toRequestBody(input),
    { headers: authHeaders() },
  );
  return response.data;
};

export const updateScheduleItem = async (id: string, input: ScheduleItemInput) => {
  const response = await axios.patch<{ updatedScheduleItem?: ScheduleItem; updated_schedule_item?: ScheduleItem }>(
    `${API_CORE_BASE_URL}/api/schedule-items/${id}`,
    toRequestBody(input),
    { headers: authHeaders() },
  );
  return response.data.updatedScheduleItem ?? response.data.updated_schedule_item;
};

export const deleteScheduleItem = async (id: string) => {
  const response = await axios.delete<{ deletedScheduleItem?: ScheduleItem; deleted_schedule_item?: ScheduleItem }>(
    `${API_CORE_BASE_URL}/api/schedule-items/${id}`,
    { headers: authHeaders() },
  );
  return response.data.deletedScheduleItem ?? response.data.deleted_schedule_item;
};
