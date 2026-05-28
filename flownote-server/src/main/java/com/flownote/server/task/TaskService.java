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
    private static final Map<String, String> UPDATE_COLUMNS = Map.ofEntries(
            Map.entry("task_name", "task_name"),
            Map.entry("category", "category"),
            Map.entry("difficulty_level", "difficulty_level"),
            Map.entry("status", "status"),
            Map.entry("estimated_minutes", "estimated_minutes"),
            Map.entry("actual_minutes", "actual_minutes"),
            Map.entry("due_date", "due_date"),
            Map.entry("memo", "memo"),
            Map.entry("tags", "tags"),
            Map.entry("links", "links"),
            Map.entry("time_logs", "time_logs")
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
                request.actualMinutes(),
                request.dueDate(),
                request.memo(),
                request.tags(),
                request.links(),
                request.timeLogs()
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

            switch (field.getKey()) {
                case "memo" -> {
                    var stored = taskRepository.storeMemo(userId, id, field.getValue() == null || field.getValue().isNull() ? "" : field.getValue().asText());
                    assignments.add("memo = ''");
                    assignments.add("memo_object_key = ?");
                    assignments.add("memo_byte_size = ?");
                    assignments.add("memo_public_url = ?");
                    values.add(new TaskRepository.StringValue(stored.objectKey()));
                    values.add(new TaskRepository.LongValue(stored.byteSize()));
                    values.add(new TaskRepository.StringValue(stored.publicUrl()));
                }
                case "links" -> {
                    var stored = taskRepository.storeLinks(userId, id, toStringList(field.getValue()));
                    assignments.add("links = ARRAY[]::TEXT[]");
                    assignments.add("links_object_key = ?");
                    assignments.add("links_byte_size = ?");
                    assignments.add("links_public_url = ?");
                    values.add(new TaskRepository.StringValue(stored.objectKey()));
                    values.add(new TaskRepository.LongValue(stored.byteSize()));
                    values.add(new TaskRepository.StringValue(stored.publicUrl()));
                }
                case "time_logs" -> {
                    var stored = taskRepository.storeTimeLogs(userId, id, toTimeLogs(field.getValue()));
                    assignments.add("time_logs = '[]'::jsonb");
                    assignments.add("time_logs_object_key = ?");
                    assignments.add("time_logs_byte_size = ?");
                    assignments.add("time_logs_public_url = ?");
                    values.add(new TaskRepository.StringValue(stored.objectKey()));
                    values.add(new TaskRepository.LongValue(stored.byteSize()));
                    values.add(new TaskRepository.StringValue(stored.publicUrl()));
                }
                default -> {
                    assignments.add(column + " = ?");
                    values.add(toSqlValue(field.getKey(), field.getValue()));
                }
            }
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
                          memo_object_key, links, links_object_key, time_logs, time_logs_object_key,
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
                case "tags", "links" -> new TaskRepository.TextArrayValue(List.of());
                case "time_logs" -> new TaskRepository.TimeLogsValue(List.of());
                default -> new TaskRepository.StringValue(null);
            };
        }

        return switch (field) {
            case "difficulty_level", "estimated_minutes", "actual_minutes" ->
                    new TaskRepository.IntegerValue(node.asInt());
            case "due_date" -> new TaskRepository.DateValue(LocalDate.parse(node.asText()));
            case "tags", "links" -> new TaskRepository.TextArrayValue(toStringList(node));
            case "time_logs" -> new TaskRepository.TimeLogsValue(toTimeLogs(node));
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

    private static List<Task.TaskTimeLog> toTimeLogs(JsonNode node) {
        if (node == null || !node.isArray()) {
            return List.of();
        }

        List<Task.TaskTimeLog> values = new ArrayList<>();
        node.forEach(item -> {
            if (!item.isObject()) return;

            String id = item.path("id").asText(UUID.randomUUID().toString());
            String label = item.path("label").asText("");
            Integer minutes = item.hasNonNull("minutes") ? item.path("minutes").asInt() : 0;
            JsonNode performedDateNode = item.hasNonNull("performed_date")
                    ? item.path("performed_date")
                    : item.path("performedDate");
            LocalDate performedDate = !performedDateNode.isMissingNode() && !performedDateNode.isNull()
                    ? LocalDate.parse(performedDateNode.asText())
                    : LocalDate.now();

            values.add(new Task.TaskTimeLog(id, label, minutes, performedDate));
        });
        return values;
    }
}
