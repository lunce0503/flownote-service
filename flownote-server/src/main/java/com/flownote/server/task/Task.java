package com.flownote.server.task;

import java.time.Instant;
import java.time.LocalDate;
import java.util.List;

public record Task(
        String id,
        String taskName,
        String category,
        Integer difficultyLevel,
        String status,
        Integer estimatedMinutes,
        Integer actualMinutes,
        LocalDate dueDate,
        String memo,
        List<String> tags,
        Instant createdAt,
        Instant updatedAt
) {
}
