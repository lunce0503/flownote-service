import type { DayOfWeek, ScheduleItem, ScheduleItemInput } from "@/entities/schedule";

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

// 자정 넘김 의미론: 종료 < 시작이면 다음 날로 이어지는 일정이며, 시작한 요일에 전체 시간이 귀속된다.
export const isOvernightItem = (item: Pick<ScheduleItem, "start_time" | "end_time">) => (
    timeToMinutes(item.end_time) < timeToMinutes(item.start_time)
);

export const getItemDuration = (item: Pick<ScheduleItem, "start_time" | "end_time">) => {
    const start = timeToMinutes(item.start_time);
    const end = timeToMinutes(item.end_time);
    if (end > start) return end - start;
    if (end < start) return 1440 - start + end;
    return 0;
};

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

interface ScheduleSegmentBase {
    key: string;
    itemId: string;
    title: string;
    label: string;
    color: string;
    startMin: number;
    endMin: number;
    durationMinutes: number;
    range: string;
    isSpill: boolean;
}

export interface RoutineSegment extends ScheduleSegmentBase {
    lane: number;
    left: number;
    width: number;
    showLabel: boolean;
}

export interface WeeklySegment extends ScheduleSegmentBase {
    lane: number;
    top: number;
    height: number;
}

// 시작순으로 정렬된 구간에 greedy first-fit으로 레인을 배정한다(겹치는 구간은 다른 레인).
const assignLanes = (parts: Array<{ startMin: number; endMin: number }>) => {
    const laneEnds: number[] = [];
    return parts.map((part) => {
        const lane = laneEnds.findIndex((end) => end <= part.startMin);
        if (lane >= 0) {
            laneEnds[lane] = part.endMin;
            return lane;
        }
        laneEnds.push(part.endMin);
        return laneEnds.length - 1;
    });
};

// 아이템을 1~2개 구간으로 분할한다. 자정 넘김은 [start,1440] + 다음 날 [0,end] 두 조각이 된다.
const splitItemParts = (item: ScheduleItem) => {
    const start = timeToMinutes(item.start_time);
    const end = timeToMinutes(item.end_time);
    if (end > start) return [{ startMin: start, endMin: end, isSpill: false }];
    if (end < start) {
        return [
            { startMin: start, endMin: 1440, isSpill: false },
            { startMin: 0, endMin: end, isSpill: true },
        ];
    }
    return [];
};

const toSegmentBase = (item: ScheduleItem) => ({
    itemId: item.id,
    title: item.title,
    label: item.category?.trim() || item.title,
    color: item.color || "#0f766e",
    durationMinutes: getItemDuration(item),
    range: `${item.start_time.slice(0, 5)} - ${item.end_time.slice(0, 5)}${isOvernightItem(item) ? " (다음 날)" : ""}`,
});

const buildTotals = (items: ScheduleItem[]) => {
    const totals = new Map<string, { label: string; minutes: number; color: string }>();
    items.forEach((item) => {
        const label = item.category?.trim() || item.title;
        const current = totals.get(label);
        totals.set(label, {
            label,
            minutes: (current?.minutes ?? 0) + getItemDuration(item),
            color: current?.color ?? (item.color || "#0f766e"),
        });
    });
    return Array.from(totals.values()).sort((a, b) => b.minutes - a.minutes);
};

export const buildRoutineChart = (items: ScheduleItem[]) => {
    const parts = items
        .flatMap((item) => {
            const base = toSegmentBase(item);
            return splitItemParts(item).map((part, index) => ({
                ...base,
                ...part,
                key: index === 0 ? item.id : `${item.id}-b`,
            }));
        })
        .sort((a, b) => a.startMin - b.startMin || a.endMin - b.endMin);

    const lanes = assignLanes(parts);
    const segments: RoutineSegment[] = parts.map((part, index) => {
        const width = Math.max(1.25, ((part.endMin - part.startMin) / 1440) * 100);
        return {
            ...part,
            lane: lanes[index],
            left: (part.startMin / 1440) * 100,
            width,
            showLabel: width >= 3.5,
        };
    });

    // totals/totalMinutes는 구간이 아닌 아이템 기준으로 계산해 자정 넘김 분할의 이중 계산을 막는다.
    const totalMinutes = items.reduce((sum, item) => sum + getItemDuration(item), 0);
    return {
        segments,
        laneCount: segments.reduce((max, segment) => Math.max(max, segment.lane + 1), 1),
        totalMinutes,
        freeMinutes: Math.max(0, 1440 - totalMinutes),
        totals: buildTotals(items),
    };
};

const nextDay = (day: DayOfWeek): DayOfWeek => {
    const index = DAY_OPTIONS.findIndex((option) => option.value === day);
    return DAY_OPTIONS[(index + 1) % DAY_OPTIONS.length].value;
};

export const buildWeeklyChart = (items: ScheduleItem[]) => {
    const partsByDay = new Map<DayOfWeek, Array<Omit<WeeklySegment, "lane" | "top" | "height">>>(
        DAY_OPTIONS.map((option) => [option.value, []]),
    );

    items.filter((item) => item.is_active).forEach((item) => {
        const base = toSegmentBase(item);
        const start = timeToMinutes(item.start_time);
        const end = timeToMinutes(item.end_time);
        if (start === end) return;
        item.days_of_week.forEach((day) => {
            if (end > start) {
                partsByDay.get(day)?.push({ ...base, key: `${item.id}-${day}`, startMin: start, endMin: end, isSpill: false });
                return;
            }
            // 자정 넘김: 시작 요일 컬럼에 [start,1440], 다음 요일 컬럼에 [0,end] 조각을 둔다(일요일→월요일 순환).
            partsByDay.get(day)?.push({ ...base, key: `${item.id}-${day}`, startMin: start, endMin: 1440, isSpill: false });
            partsByDay.get(nextDay(day))?.push({ ...base, key: `${item.id}-${day}-spill`, startMin: 0, endMin: end, isSpill: true });
        });
    });

    return {
        days: DAY_OPTIONS.map((option) => {
            const parts = (partsByDay.get(option.value) ?? [])
                .sort((a, b) => a.startMin - b.startMin || a.endMin - b.endMin);
            const lanes = assignLanes(parts);
            const segments: WeeklySegment[] = parts.map((part, index) => ({
                ...part,
                lane: lanes[index],
                top: (part.startMin / 1440) * 100,
                height: Math.max(0.8, ((part.endMin - part.startMin) / 1440) * 100),
            }));
            return {
                day: option.value,
                label: option.label,
                laneCount: segments.reduce((max, segment) => Math.max(max, segment.lane + 1), 1),
                segments,
            };
        }),
    };
};

export const SCHEDULE_WEEKLY_VIEW_STORAGE_KEY = "flownote.schedule.weeklyView";

export const validateScheduleInput = (form: ScheduleItemInput) => {
    if (!form.title.trim()) return "시간표 제목을 입력하세요.";
    if (form.daysOfWeek.length === 0) return "반복 요일을 하나 이상 선택하세요.";
    if (!form.startTime || !form.endTime) return "시작 시간과 종료 시간을 입력하세요.";
    if (form.startTime === form.endTime) return "시작 시간과 종료 시간은 같을 수 없습니다. 자정을 넘기는 일정은 종료 시간을 더 이른 시각으로 입력하세요.";
    return null;
};
