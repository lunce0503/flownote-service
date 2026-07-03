package com.flownote.server.task;

import java.time.LocalDate;
import java.util.List;

public record CreateTaskRequest(
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
        List<String> links,
        List<Task.TaskTimeLog> timeLogs
) {
}
