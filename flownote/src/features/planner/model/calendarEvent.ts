import type { ScheduleItem, DayOfWeek } from "@/entities/schedule";
import type { TaskProps } from "@/entities/task";

// 플래너의 모든 일정을 하나의 캘린더 이벤트 형태로 정규화한다.
// 필드 이름과 의미는 RFC 5545(iCalendar)를 따르므로, 나중에 안드로이드/iOS 네이티브
// 캘린더 연동(ICS 가져오기, CalendarProvider/EventKit 동기화, 서버 sync API)을 붙일 때
// 이 모델을 그대로 매핑할 수 있다.
export type PlannerCalendarEvent = {
  /** 캘린더 간 동기화 식별자(안정적이어야 재동기화 시 중복 생성되지 않는다). */
  uid: string;
  title: string;
  /** 로컬 시작 시각. 종일 일정이면 00:00. */
  start: Date;
  end: Date;
  allDay: boolean;
  /** 주간 반복 규칙(요일 기반). 1회성 이벤트는 undefined. */
  recurrence?: { freq: "WEEKLY"; byDay: DayOfWeek[] };
  color?: string;
  description?: string;
  source: "schedule" | "task" | "diary";
};

const ICS_DAY: Record<DayOfWeek, string> = {
  SUN: "SU", MON: "MO", TUE: "TU", WED: "WE", THU: "TH", FRI: "FR", SAT: "SA",
};

export const dateKey = (date: Date) => {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
};

export const parseDateKey = (key: string) => {
  const [y, m, d] = key.split("-").map(Number);
  return new Date(y, (m ?? 1) - 1, d ?? 1);
};

export const dayOfWeekOf = (date: Date): DayOfWeek => (
  (["SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT"] as DayOfWeek[])[date.getDay()]
);

const atTime = (date: Date, hhmm: string) => {
  const [h = "0", m = "0"] = hhmm.slice(0, 5).split(":");
  const next = new Date(date);
  next.setHours(Number(h), Number(m), 0, 0);
  return next;
};

/** 반복 시간표 항목을 특정 날짜의 캘린더 이벤트로 전개한다. */
export const scheduleItemToEvent = (item: ScheduleItem, date: Date): PlannerCalendarEvent => {
  const start = atTime(date, item.start_time);
  let end = atTime(date, item.end_time);
  // 종료가 시작보다 이르면 자정을 넘긴 일정이다(다음 날로 이어짐).
  if (end <= start) end = new Date(end.getTime() + 24 * 60 * 60 * 1000);
  return {
    uid: `schedule-${item.id}@flownote`,
    title: item.title,
    start,
    end,
    allDay: false,
    recurrence: { freq: "WEEKLY", byDay: item.days_of_week },
    color: item.color,
    description: item.memo || undefined,
    source: "schedule",
  };
};

/** 해당 날짜에 실제로 발생하는 반복 일정만 고른다. */
export const scheduleItemsOnDate = (items: ScheduleItem[], date: Date) => {
  const day = dayOfWeekOf(date);
  return items
    .filter((item) => item.is_active && item.days_of_week.includes(day))
    .sort((left, right) => left.start_time.localeCompare(right.start_time));
};

/** 마감일이 있는 작업을 종일 이벤트로 변환한다. */
export const taskToEvent = (task: Pick<TaskProps, "id" | "task_name" | "due_date">): PlannerCalendarEvent | null => {
  if (!task.due_date) return null;
  const start = parseDateKey(String(task.due_date).slice(0, 10));
  const end = new Date(start);
  end.setDate(end.getDate() + 1);
  return {
    uid: `task-${task.id}@flownote`,
    title: task.task_name,
    start,
    end,
    allDay: true,
    source: "task",
  };
};

const pad = (value: number) => String(value).padStart(2, "0");

// 로컬 시각을 그대로 쓰는 floating time 형식(YYYYMMDDTHHMMSS).
// 타임존 변환 없이 사용자가 입력한 시각이 기기 캘린더에서 동일하게 보인다.
const toIcsLocal = (date: Date) => (
  `${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}T${pad(date.getHours())}${pad(date.getMinutes())}00`
);

const toIcsDate = (date: Date) => (
  `${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}`
);

const escapeIcsText = (value: string) => (
  value.replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\n/g, "\\n")
);

/**
 * 이벤트 목록을 .ics(iCalendar) 문자열로 직렬화한다.
 * 안드로이드/iOS 기본 캘린더 앱이 그대로 가져올 수 있는 표준 형식이며,
 * 추후 네이티브 앱에서 동기화를 구현할 때도 동일한 uid/RRULE 규칙을 재사용한다.
 */
export const eventsToIcs = (events: PlannerCalendarEvent[], calendarName = "Flownote Planner") => {
  const stamp = toIcsLocal(new Date());
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Flownote//Planner//KO",
    "CALSCALE:GREGORIAN",
    `X-WR-CALNAME:${escapeIcsText(calendarName)}`,
  ];

  events.forEach((event) => {
    lines.push("BEGIN:VEVENT");
    lines.push(`UID:${event.uid}`);
    lines.push(`DTSTAMP:${stamp}`);
    if (event.allDay) {
      lines.push(`DTSTART;VALUE=DATE:${toIcsDate(event.start)}`);
      lines.push(`DTEND;VALUE=DATE:${toIcsDate(event.end)}`);
    } else {
      lines.push(`DTSTART:${toIcsLocal(event.start)}`);
      lines.push(`DTEND:${toIcsLocal(event.end)}`);
    }
    if (event.recurrence) {
      lines.push(`RRULE:FREQ=${event.recurrence.freq};BYDAY=${event.recurrence.byDay.map((day) => ICS_DAY[day]).join(",")}`);
    }
    lines.push(`SUMMARY:${escapeIcsText(event.title)}`);
    if (event.description) lines.push(`DESCRIPTION:${escapeIcsText(event.description)}`);
    lines.push("END:VEVENT");
  });

  lines.push("END:VCALENDAR");
  return lines.join("\r\n");
};

/** 달력 격자: 일요일 시작 6주(42칸) 고정이라 월이 바뀌어도 레이아웃이 흔들리지 않는다. */
export const monthMatrix = (year: number, month: number) => {
  const first = new Date(year, month, 1);
  const start = new Date(first);
  start.setDate(first.getDate() - first.getDay());
  return Array.from({ length: 42 }, (_, index) => {
    const date = new Date(start);
    date.setDate(start.getDate() + index);
    return date;
  });
};
