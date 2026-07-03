package com.flownote.server.task;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.flownote.canvas.CanvasAssetStorage;
import com.flownote.canvas.CanvasAssetStorage.StoredCanvasAsset;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.core.RowMapper;
import org.springframework.stereotype.Repository;

import java.sql.Array;
import java.sql.Date;
import java.sql.PreparedStatement;
import java.sql.Timestamp;
import java.sql.Types;
import java.time.LocalDate;
import java.util.Arrays;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

@Repository
public class TaskRepository {
    private final JdbcTemplate jdbcTemplate;
    private final ObjectMapper objectMapper;
    private final CanvasAssetStorage assetStorage;

    private final RowMapper<Task> taskRowMapper = (rs, rowNum) -> {
        Array tagsArray = rs.getArray("tags");
        List<String> tags = tagsArray == null
                ? List.of()
                : Arrays.asList((String[]) tagsArray.getArray());
        List<String> links = readLinks(rs.getArray("links"), rs.getString("links_object_key"));
        List<Task.TaskTimeLog> timeLogs = readTimeLogs(rs.getString("time_logs"), rs.getString("time_logs_object_key"));

        return new Task(
                rs.getString("id"),
                rs.getString("task_name"),
                rs.getString("category"),
                getInteger(rs, "difficulty_level"),
                rs.getString("status"),
                getInteger(rs, "estimated_minutes"),
                getInteger(rs, "actual_minutes"),
                getLocalDate(rs, "due_date"),
                readText(rs.getString("memo"), rs.getString("memo_object_key")),
                tags,
                links,
                timeLogs,
                rs.getTimestamp("created_at").toInstant(),
                rs.getTimestamp("updated_at").toInstant()
        );
    };

    public TaskRepository(JdbcTemplate jdbcTemplate, ObjectMapper objectMapper, CanvasAssetStorage assetStorage) {
        this.jdbcTemplate = jdbcTemplate;
        this.objectMapper = objectMapper;
        this.assetStorage = assetStorage;
    }

    public List<Task> findAll(UUID userId) {
        return jdbcTemplate.query("""
                SELECT id, task_name, category, difficulty_level, status,
                       estimated_minutes, actual_minutes, due_date, memo, tags,
                       memo_object_key, links, links_object_key, time_logs, time_logs_object_key,
                       created_at, updated_at
                FROM tasks
                WHERE user_id = ?
                ORDER BY due_date ASC NULLS LAST, created_at DESC
                """, taskRowMapper, userId);
    }

    public Task create(UUID userId, CreateTaskRequest request) {
        StoredCanvasAsset storedMemo = storeMemo(userId, request.id(), request.memo());
        StoredCanvasAsset storedLinks = storeLinks(userId, request.id(), request.links());
        StoredCanvasAsset storedTimeLogs = storeTimeLogs(userId, request.id(), request.timeLogs());
        List<Task> tasks = jdbcTemplate.query(connection -> {
            PreparedStatement ps = connection.prepareStatement("""
                    INSERT INTO tasks (
                        id, user_id, task_name, category, difficulty_level, status,
                        estimated_minutes, actual_minutes, due_date, memo, memo_object_key, memo_byte_size, memo_public_url,
                        tags, links, links_object_key, links_byte_size, links_public_url,
                        time_logs, time_logs_object_key, time_logs_byte_size, time_logs_public_url
                    )
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, '', ?, ?, ?, ?, ARRAY[]::TEXT[], ?, ?, ?, '[]'::jsonb, ?, ?, ?)
                    RETURNING id, task_name, category, difficulty_level, status,
                              estimated_minutes, actual_minutes, due_date, memo, tags,
                              memo_object_key, links, links_object_key, time_logs, time_logs_object_key,
                              created_at, updated_at
                    """);
            ps.setObject(1, UUID.fromString(request.id()));
            ps.setObject(2, userId);
            ps.setString(3, request.taskName());
            setNullableString(ps, 4, request.category());
            setNullableInteger(ps, 5, request.difficultyLevel());
            setNullableString(ps, 6, request.status());
            setNullableInteger(ps, 7, request.estimatedMinutes());
            setNullableInteger(ps, 8, request.actualMinutes());
            setNullableDate(ps, 9, request.dueDate());
            ps.setString(10, storedMemo.objectKey());
            ps.setLong(11, storedMemo.byteSize());
            ps.setString(12, storedMemo.publicUrl());
            ps.setArray(13, connection.createArrayOf("text", normalizeTextArray(request.tags())));
            ps.setString(14, storedLinks.objectKey());
            ps.setLong(15, storedLinks.byteSize());
            ps.setString(16, storedLinks.publicUrl());
            ps.setString(17, storedTimeLogs.objectKey());
            ps.setLong(18, storedTimeLogs.byteSize());
            ps.setString(19, storedTimeLogs.publicUrl());
            return ps;
        }, taskRowMapper);

        return tasks.get(0);
    }

    public Optional<Task> update(String sql, List<SqlValue> values) {
        List<Task> tasks = jdbcTemplate.query(connection -> {
            PreparedStatement ps = connection.prepareStatement(sql);
            for (int i = 0; i < values.size(); i++) {
                values.get(i).bind(ps, i + 1);
            }
            return ps;
        }, taskRowMapper);

        return tasks.stream().findFirst();
    }

    public Optional<Task> delete(UUID userId, String id) {
        List<Task> tasks = jdbcTemplate.query("""
                DELETE FROM tasks
                WHERE id = ? AND user_id = ?
                RETURNING id, task_name, category, difficulty_level, status,
                          estimated_minutes, actual_minutes, due_date, memo, tags,
                          memo_object_key, links, links_object_key, time_logs, time_logs_object_key,
                          created_at, updated_at
                """, taskRowMapper, UUID.fromString(id), userId);
        return tasks.stream().findFirst();
    }

    private static Integer getInteger(java.sql.ResultSet rs, String column) throws java.sql.SQLException {
        int value = rs.getInt(column);
        return rs.wasNull() ? null : value;
    }

    private static LocalDate getLocalDate(java.sql.ResultSet rs, String column) throws java.sql.SQLException {
        Date value = rs.getDate(column);
        return value == null ? null : value.toLocalDate();
    }

    private static void setNullableString(PreparedStatement ps, int index, String value) throws java.sql.SQLException {
        if (value == null) {
            ps.setNull(index, Types.VARCHAR);
        } else {
            ps.setString(index, value);
        }
    }

    private static void setNullableInteger(PreparedStatement ps, int index, Integer value) throws java.sql.SQLException {
        if (value == null) {
            ps.setNull(index, Types.INTEGER);
        } else {
            ps.setInt(index, value);
        }
    }

    private static void setNullableDate(PreparedStatement ps, int index, LocalDate value) throws java.sql.SQLException {
        if (value == null) {
            ps.setNull(index, Types.DATE);
        } else {
            ps.setDate(index, Date.valueOf(value));
        }
    }

    private static String[] normalizeTextArray(List<String> values) {
        if (values == null) {
            return new String[0];
        }
        return values.stream()
                .filter(value -> value != null && !value.isBlank())
                .map(String::trim)
                .distinct()
                .toArray(String[]::new);
    }

    public StoredCanvasAsset storeMemo(UUID userId, String taskId, String memo) {
        return assetStorage.putText("task-payloads/%s/%s/memo.txt".formatted(userId, taskId), memo);
    }

    public StoredCanvasAsset storeLinks(UUID userId, String taskId, List<String> links) {
        return assetStorage.putJson("task-payloads/%s/%s/links.json".formatted(userId, taskId), writeJson(normalizeTextArray(links)));
    }

    public StoredCanvasAsset storeTimeLogs(UUID userId, String taskId, List<Task.TaskTimeLog> timeLogs) {
        return assetStorage.putJson("task-payloads/%s/%s/time-logs.json".formatted(userId, taskId), writeJson(timeLogs == null ? List.of() : timeLogs));
    }

    private String readText(String fallback, String objectKey) {
        return objectKey == null || objectKey.isBlank() ? fallback : assetStorage.readText(objectKey);
    }

    private List<String> readLinks(Array linksArray, String objectKey) throws java.sql.SQLException {
        if (objectKey != null && !objectKey.isBlank()) {
            try {
                return objectMapper.readValue(assetStorage.readText(objectKey), new TypeReference<>() {});
            } catch (JsonProcessingException ignored) {
                return List.of();
            }
        }
        return linksArray == null ? List.of() : Arrays.asList((String[]) linksArray.getArray());
    }

    private List<Task.TaskTimeLog> readTimeLogs(String value, String objectKey) {
        return parseTimeLogs(objectKey == null || objectKey.isBlank() ? value : assetStorage.readText(objectKey));
    }

    private List<Task.TaskTimeLog> parseTimeLogs(String value) {
        if (value == null || value.isBlank()) {
            return List.of();
        }

        try {
            return objectMapper.readValue(value, new TypeReference<>() {});
        } catch (JsonProcessingException ignored) {
            return List.of();
        }
    }

    private String serializeTimeLogs(List<Task.TaskTimeLog> value) {
        return writeJson(value == null ? List.of() : value);
    }

    private String writeJson(Object value) {
        try {
            return objectMapper.writeValueAsString(value);
        } catch (JsonProcessingException ignored) {
            return "[]";
        }
    }

    private static void setJsonb(PreparedStatement ps, int index, String value) throws java.sql.SQLException {
        ps.setObject(index, value == null || value.isBlank() ? "[]" : value, Types.OTHER);
    }

    public sealed interface SqlValue permits StringValue, IntegerValue, LongValue, DateValue, TextArrayValue, TimeLogsValue, UuidValue {
        void bind(PreparedStatement ps, int index) throws java.sql.SQLException;
    }

    public record StringValue(String value) implements SqlValue {
        @Override
        public void bind(PreparedStatement ps, int index) throws java.sql.SQLException {
            setNullableString(ps, index, value);
        }
    }

    public record IntegerValue(Integer value) implements SqlValue {
        @Override
        public void bind(PreparedStatement ps, int index) throws java.sql.SQLException {
            setNullableInteger(ps, index, value);
        }
    }

    public record LongValue(Long value) implements SqlValue {
        @Override
        public void bind(PreparedStatement ps, int index) throws java.sql.SQLException {
            if (value == null) {
                ps.setNull(index, Types.BIGINT);
            } else {
                ps.setLong(index, value);
            }
        }
    }

    public record DateValue(LocalDate value) implements SqlValue {
        @Override
        public void bind(PreparedStatement ps, int index) throws java.sql.SQLException {
            setNullableDate(ps, index, value);
        }
    }

    public record TextArrayValue(List<String> value) implements SqlValue {
        @Override
        public void bind(PreparedStatement ps, int index) throws java.sql.SQLException {
            ps.setArray(index, ps.getConnection().createArrayOf("text", normalizeTextArray(value)));
        }
    }

    public record TimeLogsValue(List<Task.TaskTimeLog> value) implements SqlValue {
        @Override
        public void bind(PreparedStatement ps, int index) throws java.sql.SQLException {
            try {
                setJsonb(ps, index, new ObjectMapper().writeValueAsString(value == null ? List.of() : value));
            } catch (JsonProcessingException ignored) {
                setJsonb(ps, index, "[]");
            }
        }
    }

    public record UuidValue(UUID value) implements SqlValue {
        @Override
        public void bind(PreparedStatement ps, int index) throws java.sql.SQLException {
            ps.setObject(index, value);
        }
    }
}
