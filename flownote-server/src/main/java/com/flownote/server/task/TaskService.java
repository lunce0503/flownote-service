package com.flownote.server.task;

import com.fasterxml.jackson.databind.JsonNode;
import org.springframework.stereotype.Service;
import org.springframework.util.StringUtils;

import java.time.LocalDate;
import java.util.ArrayList;
import java.util.Iterator;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;

@Service
public class TaskService {
    private static final Map<String, String> UPDATE_COLUMNS = Map.of(
            "task_name", "task_name",
            "category", "category",
            "difficulty_level", "difficulty_level",
            "status", "status",
            "estimated_minutes", "estimated_minutes",
            "actual_minutes", "actual_minutes",
            "due_date", "due_date",
            "memo", "memo",
            "tags", "tags"
    );

    private final TaskRepository taskRepository;

    public TaskService(TaskRepository taskRepository) {
        this.taskRepository = taskRepository;
    }

    public List<Task> findAll(UUID userId) {
        return taskRepository.findAll(userId);
    }

    public Task create(UUID userId, CreateTaskRequest request) {
        String id = StringUtils.hasText(request.id()) ? request.id() : UUID.randomUUID().toString();
        CreateTaskRequest normalized = new CreateTaskRequest(
                id,
                request.taskName() == null ? "" : request.taskName(),
                request.category(),
                request.difficultyLevel(),
                request.status(),
                request.estimatedMinutes(),
                request.dueDate(),
                request.memo(),
                request.tags()
        );
        return taskRepository.create(userId, normalized);
    }

    public Optional<Task> update(UUID userId, String id, JsonNode body) {
        if (body == null || !body.isObject() || body.isEmpty()) {
            return Optional.empty();
        }

        List<String> assignments = new ArrayList<>();
        List<TaskRepository.SqlValue> values = new ArrayList<>();

        Iterator<Map.Entry<String, JsonNode>> fields = body.fields();
        while (fields.hasNext()) {
            Map.Entry<String, JsonNode> field = fields.next();
            String column = UPDATE_COLUMNS.get(field.getKey());
            if (column == null) {
                continue;
            }

            assignments.add(column + " = ?");
            values.add(toSqlValue(field.getKey(), field.getValue()));
        }

        if (assignments.isEmpty()) {
            return Optional.empty();
        }

        values.add(new TaskRepository.UuidValue(UUID.fromString(id)));
        values.add(new TaskRepository.UuidValue(userId));
        String sql = """
                UPDATE tasks
                SET %s, updated_at = NOW()
                WHERE id = ? AND user_id = ?
                RETURNING id, task_name, category, difficulty_level, status,
                          estimated_minutes, actual_minutes, due_date, memo, tags,
                          created_at, updated_at
                """.formatted(String.join(", ", assignments));

        return taskRepository.update(sql, values);
    }

    public Optional<Task> delete(UUID userId, String id) {
        return taskRepository.delete(userId, id);
    }

    private static TaskRepository.SqlValue toSqlValue(String field, JsonNode node) {
        if (node == null || node.isNull()) {
            return switch (field) {
                case "difficulty_level", "estimated_minutes", "actual_minutes" -> new TaskRepository.IntegerValue(null);
                case "due_date" -> new TaskRepository.DateValue(null);
                case "tags" -> new TaskRepository.TagsValue(List.of());
                default -> new TaskRepository.StringValue(null);
            };
        }

        return switch (field) {
            case "difficulty_level", "estimated_minutes", "actual_minutes" ->
                    new TaskRepository.IntegerValue(node.asInt());
            case "due_date" -> new TaskRepository.DateValue(LocalDate.parse(node.asText()));
            case "tags" -> new TaskRepository.TagsValue(toStringList(node));
            default -> new TaskRepository.StringValue(node.asText());
        };
    }

    private static List<String> toStringList(JsonNode node) {
        if (node == null || !node.isArray()) {
            return List.of();
        }

        List<String> values = new ArrayList<>();
        node.forEach(item -> values.add(item.asText()));
        return values;
    }
}
