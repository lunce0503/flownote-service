package com.flownote.server.schedule;

import java.time.Instant;
import java.time.LocalTime;
import java.util.List;

public record ScheduleItem(
        String id,
        String title,
        List<String> daysOfWeek,
        LocalTime startTime,
        LocalTime endTime,
        String category,
        String color,
        String memo,
        Boolean isActive,
        Instant createdAt,
        Instant updatedAt
) {
}
