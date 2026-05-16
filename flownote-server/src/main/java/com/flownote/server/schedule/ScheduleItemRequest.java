package com.flownote.server.schedule;

import java.time.LocalTime;
import java.util.List;

public record ScheduleItemRequest(
        String title,
        List<String> daysOfWeek,
        LocalTime startTime,
        LocalTime endTime,
        String category,
        String color,
        String memo,
        Boolean isActive
) {
}
