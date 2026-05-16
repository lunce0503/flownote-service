export type DayOfWeek = "MON" | "TUE" | "WED" | "THU" | "FRI" | "SAT" | "SUN";

export interface ScheduleItem {
  id: string;
  title: string;
  days_of_week: DayOfWeek[];
  start_time: string;
  end_time: string;
  category: string;
  color: string;
  memo: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export type ScheduleItemInput = {
  title: string;
  daysOfWeek: DayOfWeek[];
  startTime: string;
  endTime: string;
  category: string;
  color: string;
  memo: string;
  isActive: boolean;
};
