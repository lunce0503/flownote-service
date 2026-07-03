import type { DayOfWeek, ScheduleItem, ScheduleItemInput } from "../../../entities/schedule";

export const DAY_OPTIONS: Array<{ value: DayOfWeek; label: string }> = [
    { value: "MON", label: "월" },
    { value: "TUE", label: "화" },
    { value: "WED", label: "수" },
    { value: "THU", label: "목" },
    { value: "FRI", label: "금" },
    { value: "SAT", label: "토" },
    { value: "SUN", label: "일" },
];

export const EMPTY_SCHEDULE_FORM: ScheduleItemInput = {
    title: "",
    daysOfWeek: ["MON", "TUE", "WED", "THU", "FRI"],
    startTime: "09:00",
    endTime: "10:00",
    category: "",
    color: "#0f766e",
    memo: "",
    isActive: true,
};

export const createDraftId = () => `draft-${Date.now()}-${Math.random().toString(16).slice(2)}`;

export const toScheduleInput = (item: ScheduleItem): ScheduleItemInput => ({
    title: item.title,
    daysOfWeek: item.days_of_week,
    startTime: item.start_time.slice(0, 5),
    endTime: item.end_time.slice(0, 5),
    category: item.category ?? "",
    color: item.color || "#0f766e",
    memo: item.memo ?? "",
    isActive: item.is_active,
});

export const toScheduleItem = (id: string, input: ScheduleItemInput): ScheduleItem => {
    const now = new Date().toISOString();
    return {
        id,
        title: input.title,
        days_of_week: input.daysOfWeek,
        start_time: input.startTime,
        end_time: input.endTime,
        category: input.category,
        color: input.color,
        memo: input.memo,
        is_active: input.isActive,
        created_at: now,
        updated_at: now,
    };
};

export const getToday = (): DayOfWeek => {
    const day = new Date().getDay();
    return (["SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT"] as DayOfWeek[])[day];
};

export const formatDateLabel = () => (
    new Intl.DateTimeFormat("ko-KR", {
        month: "long",
        day: "numeric",
        weekday: "long",
    }).format(new Date())
);

export const timeToMinutes = (time: string) => {
    const [hours = "0", minutes = "0"] = time.slice(0, 5).split(":");
    return Number(hours) * 60 + Number(minutes);
};

export const formatDuration = (minutes: number) => {
    const hours = Math.floor(minutes / 60);
    const remainingMinutes = minutes % 60;
    if (hours > 0 && remainingMinutes > 0) return `${hours}시간 ${remainingMinutes}분`;
    if (hours > 0) return `${hours}시간`;
    return `${remainingMinutes}분`;
};

export const formatDays = (days: DayOfWeek[]) => (
    DAY_OPTIONS.filter((day) => days.includes(day.value)).map((day) => day.label).join(", ") || "요일 없음"
);

export const getDayLabel = (day: DayOfWeek) => (
    DAY_OPTIONS.find((option) => option.value === day)?.label ?? ""
);

export const getItemDuration = (item: Pick<ScheduleItem, "start_time" | "end_time">) => (
    Math.max(0, timeToMinutes(item.end_time) - timeToMinutes(item.start_time))
);

export const sortScheduleItems = (items: ScheduleItem[]) => (
    [...items].sort((a, b) => a.start_time.localeCompare(b.start_time) || a.title.localeCompare(b.title))
);

export const getTodayScheduleItems = (items: ScheduleItem[], today: DayOfWeek) => (
    items
        .filter((item) => item.is_active && item.days_of_week.includes(today))
        .sort((a, b) => a.start_time.localeCompare(b.start_time))
);

export const getScheduleItemsByDay = (items: ScheduleItem[], day: DayOfWeek) => (
    items
        .filter((item) => item.is_active && item.days_of_week.includes(day))
        .sort((a, b) => a.start_time.localeCompare(b.start_time))
);

export const getDayTotals = (items: ScheduleItem[]) => DAY_OPTIONS.map((day) => {
    const minutes = items
        .filter((item) => item.is_active && item.days_of_week.includes(day.value))
        .reduce((sum, item) => sum + getItemDuration(item), 0);
    return { ...day, minutes };
});

export const buildRoutineChart = (items: ScheduleItem[]) => {
    const segments = items.map((item) => {
        const start = timeToMinutes(item.start_time);
        const end = timeToMinutes(item.end_time);
        const duration = Math.max(0, end - start);
        return {
            id: item.id,
            title: item.title,
            label: item.category?.trim() || item.title,
            color: item.color || "#0f766e",
            start,
            end,
            duration,
            left: (start / 1440) * 100,
            width: Math.max(0.5, (duration / 1440) * 100),
            range: `${item.start_time.slice(0, 5)} - ${item.end_time.slice(0, 5)}`,
        };
    });

    const totals = new Map<string, { label: string; minutes: number; color: string }>();
    segments.forEach((segment) => {
        const current = totals.get(segment.label);
        totals.set(segment.label, {
            label: segment.label,
            minutes: (current?.minutes ?? 0) + segment.duration,
            color: current?.color ?? segment.color,
        });
    });

    const totalMinutes = segments.reduce((sum, segment) => sum + segment.duration, 0);
    return {
        segments,
        totalMinutes,
        freeMinutes: Math.max(0, 1440 - totalMinutes),
        totals: Array.from(totals.values()).sort((a, b) => b.minutes - a.minutes),
    };
};

export const validateScheduleInput = (form: ScheduleItemInput) => {
    if (!form.title.trim()) return "시간표 제목을 입력하세요.";
    if (form.daysOfWeek.length === 0) return "반복 요일을 하나 이상 선택하세요.";
    if (!form.startTime || !form.endTime || form.startTime >= form.endTime) return "시작 시간은 종료 시간보다 빨라야 합니다.";
    return null;
};
