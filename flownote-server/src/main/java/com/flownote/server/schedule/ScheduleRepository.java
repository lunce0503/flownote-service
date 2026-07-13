package com.flownote.server.schedule;

import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.core.RowMapper;
import org.springframework.stereotype.Repository;

import com.flownote.storage.CanvasAssetStorage;
import com.flownote.storage.CanvasAssetStorage.StoredCanvasAsset;

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
    private final CanvasAssetStorage assetStorage;

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
                readMemo(rs.getString("memo"), rs.getString("memo_object_key")),
                rs.getBoolean("is_active"),
                rs.getTimestamp("created_at").toInstant(),
                rs.getTimestamp("updated_at").toInstant()
        );
    };

    public ScheduleRepository(JdbcTemplate jdbcTemplate, CanvasAssetStorage assetStorage) {
        this.jdbcTemplate = jdbcTemplate;
        this.assetStorage = assetStorage;
    }

    public List<ScheduleItem> findAll(UUID userId) {
        return jdbcTemplate.query("""
                SELECT id, title, days_of_week, start_time, end_time, category,
                       color, memo, memo_object_key, is_active, created_at, updated_at
                FROM daily_schedule_items
                WHERE user_id = ?
                ORDER BY start_time ASC, created_at DESC
                """, rowMapper, userId);
    }

    public ScheduleItem create(UUID userId, ScheduleItemRequest request) {
        String itemId = UUID.randomUUID().toString();
        StoredCanvasAsset storedMemo = storeMemo(userId, itemId, request.memo());
        List<ScheduleItem> items = jdbcTemplate.query(connection -> {
            PreparedStatement ps = connection.prepareStatement("""
                    INSERT INTO daily_schedule_items (
                        id, user_id, title, days_of_week, start_time, end_time,
                        category, color, memo, memo_object_key, memo_byte_size, memo_public_url, is_active
                    )
                    VALUES (?::uuid, ?, ?, ?, ?, ?, ?, ?, '', ?, ?, ?, ?)
                    RETURNING id, title, days_of_week, start_time, end_time, category,
                              color, memo, memo_object_key, is_active, created_at, updated_at
                    """);
            ps.setString(1, itemId);
            ps.setObject(2, userId);
            ps.setString(3, request.title());
            ps.setArray(4, connection.createArrayOf("text", request.daysOfWeek().toArray(String[]::new)));
            ps.setTime(5, Time.valueOf(request.startTime()));
            ps.setTime(6, Time.valueOf(request.endTime()));
            setNullableString(ps, 7, request.category());
            ps.setString(8, request.color());
            ps.setString(9, storedMemo.objectKey());
            ps.setLong(10, storedMemo.byteSize());
            ps.setString(11, storedMemo.publicUrl());
            ps.setBoolean(12, Boolean.TRUE.equals(request.isActive()));
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
                          color, memo, memo_object_key, is_active, created_at, updated_at
                """, rowMapper, id, userId);
        return items.stream().findFirst();
    }

    public StoredCanvasAsset storeMemo(UUID userId, String itemId, String memo) {
        return assetStorage.putText("schedule-payloads/%s/%s/memo.txt".formatted(userId, itemId), memo);
    }

    private String readMemo(String fallback, String objectKey) {
        return objectKey == null || objectKey.isBlank() ? fallback : assetStorage.readText(objectKey);
    }

    private static void setNullableString(PreparedStatement ps, int index, String value) throws java.sql.SQLException {
        if (value == null) {
            ps.setNull(index, Types.VARCHAR);
        } else {
            ps.setString(index, value);
        }
    }

    public sealed interface SqlValue permits StringValue, LongValue, TimeValue, DaysValue, BooleanValue, UuidValue {
        void bind(PreparedStatement ps, int index) throws java.sql.SQLException;
    }

    public record StringValue(String value) implements SqlValue {
        @Override
        public void bind(PreparedStatement ps, int index) throws java.sql.SQLException {
            setNullableString(ps, index, value);
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
