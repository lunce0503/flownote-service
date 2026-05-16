package com.flownote.server.schedule;

import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.core.RowMapper;
import org.springframework.stereotype.Repository;

import java.sql.Array;
import java.sql.PreparedStatement;
import java.sql.Time;
import java.sql.Types;
import java.time.LocalTime;
import java.util.Arrays;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

@Repository
public class ScheduleRepository {
    private final JdbcTemplate jdbcTemplate;

    private final RowMapper<ScheduleItem> rowMapper = (rs, rowNum) -> {
        Array daysArray = rs.getArray("days_of_week");
        List<String> days = daysArray == null
                ? List.of()
                : Arrays.asList((String[]) daysArray.getArray());

        return new ScheduleItem(
                rs.getString("id"),
                rs.getString("title"),
                days,
                rs.getTime("start_time").toLocalTime(),
                rs.getTime("end_time").toLocalTime(),
                rs.getString("category"),
                rs.getString("color"),
                rs.getString("memo"),
                rs.getBoolean("is_active"),
                rs.getTimestamp("created_at").toInstant(),
                rs.getTimestamp("updated_at").toInstant()
        );
    };

    public ScheduleRepository(JdbcTemplate jdbcTemplate) {
        this.jdbcTemplate = jdbcTemplate;
    }

    public List<ScheduleItem> findAll(UUID userId) {
        return jdbcTemplate.query("""
                SELECT id, title, days_of_week, start_time, end_time, category,
                       color, memo, is_active, created_at, updated_at
                FROM daily_schedule_items
                WHERE user_id = ?
                ORDER BY start_time ASC, created_at DESC
                """, rowMapper, userId);
    }

    public ScheduleItem create(UUID userId, ScheduleItemRequest request) {
        List<ScheduleItem> items = jdbcTemplate.query(connection -> {
            PreparedStatement ps = connection.prepareStatement("""
                    INSERT INTO daily_schedule_items (
                        user_id, title, days_of_week, start_time, end_time,
                        category, color, memo, is_active
                    )
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
                    RETURNING id, title, days_of_week, start_time, end_time, category,
                              color, memo, is_active, created_at, updated_at
                    """);
            ps.setObject(1, userId);
            ps.setString(2, request.title());
            ps.setArray(3, connection.createArrayOf("text", request.daysOfWeek().toArray(String[]::new)));
            ps.setTime(4, Time.valueOf(request.startTime()));
            ps.setTime(5, Time.valueOf(request.endTime()));
            setNullableString(ps, 6, request.category());
            ps.setString(7, request.color());
            setNullableString(ps, 8, request.memo());
            ps.setBoolean(9, Boolean.TRUE.equals(request.isActive()));
            return ps;
        }, rowMapper);

        return items.get(0);
    }

    public Optional<ScheduleItem> update(String sql, List<SqlValue> values) {
        List<ScheduleItem> items = jdbcTemplate.query(connection -> {
            PreparedStatement ps = connection.prepareStatement(sql);
            for (int i = 0; i < values.size(); i++) {
                values.get(i).bind(ps, i + 1);
            }
            return ps;
        }, rowMapper);

        return items.stream().findFirst();
    }

    public Optional<ScheduleItem> delete(UUID userId, UUID id) {
        List<ScheduleItem> items = jdbcTemplate.query("""
                DELETE FROM daily_schedule_items
                WHERE id = ? AND user_id = ?
                RETURNING id, title, days_of_week, start_time, end_time, category,
                          color, memo, is_active, created_at, updated_at
                """, rowMapper, id, userId);
        return items.stream().findFirst();
    }

    private static void setNullableString(PreparedStatement ps, int index, String value) throws java.sql.SQLException {
        if (value == null) {
            ps.setNull(index, Types.VARCHAR);
        } else {
            ps.setString(index, value);
        }
    }

    public sealed interface SqlValue permits StringValue, TimeValue, DaysValue, BooleanValue, UuidValue {
        void bind(PreparedStatement ps, int index) throws java.sql.SQLException;
    }

    public record StringValue(String value) implements SqlValue {
        @Override
        public void bind(PreparedStatement ps, int index) throws java.sql.SQLException {
            setNullableString(ps, index, value);
        }
    }

    public record TimeValue(LocalTime value) implements SqlValue {
        @Override
        public void bind(PreparedStatement ps, int index) throws java.sql.SQLException {
            if (value == null) {
                ps.setNull(index, Types.TIME);
            } else {
                ps.setTime(index, Time.valueOf(value));
            }
        }
    }

    public record DaysValue(List<String> value) implements SqlValue {
        @Override
        public void bind(PreparedStatement ps, int index) throws java.sql.SQLException {
            ps.setArray(index, ps.getConnection().createArrayOf("text", value.toArray(String[]::new)));
        }
    }

    public record BooleanValue(Boolean value) implements SqlValue {
        @Override
        public void bind(PreparedStatement ps, int index) throws java.sql.SQLException {
            if (value == null) {
                ps.setNull(index, Types.BOOLEAN);
            } else {
                ps.setBoolean(index, value);
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
