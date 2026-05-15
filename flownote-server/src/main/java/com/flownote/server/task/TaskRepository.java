package com.flownote.server.task;

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

    private final RowMapper<Task> taskRowMapper = (rs, rowNum) -> {
        Array tagsArray = rs.getArray("tags");
        List<String> tags = tagsArray == null
                ? List.of()
                : Arrays.asList((String[]) tagsArray.getArray());

        return new Task(
                rs.getString("id"),
                rs.getString("task_name"),
                rs.getString("category"),
                getInteger(rs, "difficulty_level"),
                rs.getString("status"),
                getInteger(rs, "estimated_minutes"),
                getInteger(rs, "actual_minutes"),
                getLocalDate(rs, "due_date"),
                rs.getString("memo"),
                tags,
                rs.getTimestamp("created_at").toInstant(),
                rs.getTimestamp("updated_at").toInstant()
        );
    };

    public TaskRepository(JdbcTemplate jdbcTemplate) {
        this.jdbcTemplate = jdbcTemplate;
    }

    public List<Task> findAll(UUID userId) {
        return jdbcTemplate.query("""
                SELECT id, task_name, category, difficulty_level, status,
                       estimated_minutes, actual_minutes, due_date, memo, tags,
                       created_at, updated_at
                FROM tasks
                WHERE user_id = ?
                ORDER BY due_date ASC NULLS LAST, created_at DESC
                """, taskRowMapper, userId);
    }

    public Task create(UUID userId, CreateTaskRequest request) {
        List<Task> tasks = jdbcTemplate.query(connection -> {
            PreparedStatement ps = connection.prepareStatement("""
                    INSERT INTO tasks (
                        id, user_id, task_name, category, difficulty_level, status,
                        estimated_minutes, due_date, memo, tags
                    )
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                    RETURNING id, task_name, category, difficulty_level, status,
                              estimated_minutes, actual_minutes, due_date, memo, tags,
                              created_at, updated_at
                    """);
            ps.setObject(1, UUID.fromString(request.id()));
            ps.setObject(2, userId);
            ps.setString(3, request.taskName());
            setNullableString(ps, 4, request.category());
            setNullableInteger(ps, 5, request.difficultyLevel());
            setNullableString(ps, 6, request.status());
            setNullableInteger(ps, 7, request.estimatedMinutes());
            setNullableDate(ps, 8, request.dueDate());
            setNullableString(ps, 9, request.memo());
            ps.setArray(10, connection.createArrayOf("text", normalizeTags(request.tags())));
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

    private static String[] normalizeTags(List<String> tags) {
        if (tags == null) {
            return new String[0];
        }
        return tags.toArray(String[]::new);
    }

    public sealed interface SqlValue permits StringValue, IntegerValue, DateValue, TagsValue, UuidValue {
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

    public record DateValue(LocalDate value) implements SqlValue {
        @Override
        public void bind(PreparedStatement ps, int index) throws java.sql.SQLException {
            setNullableDate(ps, index, value);
        }
    }

    public record TagsValue(List<String> value) implements SqlValue {
        @Override
        public void bind(PreparedStatement ps, int index) throws java.sql.SQLException {
            ps.setArray(index, ps.getConnection().createArrayOf("text", normalizeTags(value)));
        }
    }

    public record UuidValue(UUID value) implements SqlValue {
        @Override
        public void bind(PreparedStatement ps, int index) throws java.sql.SQLException {
            ps.setObject(index, value);
        }
    }
}
