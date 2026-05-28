package com.flownote.server.schedule;

import com.fasterxml.jackson.databind.JsonNode;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.util.StringUtils;
import org.springframework.web.server.ResponseStatusException;

import java.time.LocalTime;
import java.util.ArrayList;
import java.util.Iterator;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.Set;
import java.util.UUID;

@Service
public class ScheduleService {
    private static final Set<String> VALID_DAYS = Set.of("MON", "TUE", "WED", "THU", "FRI", "SAT", "SUN");
    private static final Map<String, String> UPDATE_COLUMNS = Map.of(
            "title", "title",
            "days_of_week", "days_of_week",
            "start_time", "start_time",
            "end_time", "end_time",
            "category", "category",
            "color", "color",
            "memo", "memo",
            "is_active", "is_active"
    );

    private final ScheduleRepository scheduleRepository;

    public ScheduleService(ScheduleRepository scheduleRepository) {
        this.scheduleRepository = scheduleRepository;
    }

    public List<ScheduleItem> findAll(UUID userId) {
        return scheduleRepository.findAll(userId);
    }

    public ScheduleItem create(UUID userId, ScheduleItemRequest request) {
        ScheduleItemRequest normalized = normalize(request);
        validate(normalized);
        return scheduleRepository.create(userId, normalized);
    }

    public Optional<ScheduleItem> update(UUID userId, String id, JsonNode body) {
        if (body == null || !body.isObject() || body.isEmpty()) {
            return Optional.empty();
        }

        List<String> assignments = new ArrayList<>();
        List<ScheduleRepository.SqlValue> values = new ArrayList<>();
        Iterator<Map.Entry<String, JsonNode>> fields = body.fields();
        while (fields.hasNext()) {
            Map.Entry<String, JsonNode> field = fields.next();
            String column = UPDATE_COLUMNS.get(field.getKey());
            if (column == null) {
                continue;
            }

            if ("memo".equals(field.getKey())) {
                var stored = scheduleRepository.storeMemo(userId, id, field.getValue() == null || field.getValue().isNull() ? "" : field.getValue().asText().trim());
                assignments.add("memo = ''");
                assignments.add("memo_object_key = ?");
                assignments.add("memo_byte_size = ?");
                assignments.add("memo_public_url = ?");
                values.add(new ScheduleRepository.StringValue(stored.objectKey()));
                values.add(new ScheduleRepository.LongValue(stored.byteSize()));
                values.add(new ScheduleRepository.StringValue(stored.publicUrl()));
            } else {
                assignments.add(column + " = ?");
                values.add(toSqlValue(field.getKey(), field.getValue()));
            }
        }

        if (assignments.isEmpty()) {
            return Optional.empty();
        }

        values.add(new ScheduleRepository.UuidValue(UUID.fromString(id)));
        values.add(new ScheduleRepository.UuidValue(userId));
        String sql = """
                UPDATE daily_schedule_items
                SET %s, updated_at = NOW()
                WHERE id = ? AND user_id = ?
                  AND start_time < end_time
                  AND cardinality(days_of_week) > 0
                RETURNING id, title, days_of_week, start_time, end_time, category,
                          color, memo, memo_object_key, is_active, created_at, updated_at
                """.formatted(String.join(", ", assignments));

        return scheduleRepository.update(sql, values);
    }

    public Optional<ScheduleItem> delete(UUID userId, String id) {
        return scheduleRepository.delete(userId, UUID.fromString(id));
    }

    private static ScheduleItemRequest normalize(ScheduleItemRequest request) {
        if (request == null) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "시간표 데이터가 필요합니다.");
        }

        return new ScheduleItemRequest(
                request.title() == null ? "" : request.title().trim(),
                normalizeDays(request.daysOfWeek()),
                request.startTime(),
                request.endTime(),
                request.category() == null ? "" : request.category().trim(),
                StringUtils.hasText(request.color()) ? request.color().trim() : "#0f766e",
                request.memo() == null ? "" : request.memo().trim(),
                request.isActive() == null || request.isActive()
        );
    }

    private static void validate(ScheduleItemRequest request) {
        if (!StringUtils.hasText(request.title())) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "시간표 제목은 필수입니다.");
        }
        if (request.daysOfWeek().isEmpty()) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "반복 요일을 하나 이상 선택해야 합니다.");
        }
        if (request.startTime() == null || request.endTime() == null || !request.startTime().isBefore(request.endTime())) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "시작 시간은 종료 시간보다 빨라야 합니다.");
        }
    }

    private static ScheduleRepository.SqlValue toSqlValue(String field, JsonNode node) {
        return switch (field) {
            case "days_of_week" -> new ScheduleRepository.DaysValue(normalizeDays(toStringList(node)));
            case "start_time", "end_time" -> new ScheduleRepository.TimeValue(node == null || node.isNull() ? null : LocalTime.parse(node.asText()));
            case "is_active" -> new ScheduleRepository.BooleanValue(node != null && !node.isNull() ? node.asBoolean() : null);
            case "color" -> new ScheduleRepository.StringValue(node == null || node.isNull() || !StringUtils.hasText(node.asText()) ? "#0f766e" : node.asText().trim());
            default -> new ScheduleRepository.StringValue(node == null || node.isNull() ? "" : node.asText().trim());
        };
    }

    private static List<String> normalizeDays(List<String> days) {
        if (days == null) {
            return List.of();
        }

        LinkedHashSet<String> normalized = new LinkedHashSet<>();
        for (String day : days) {
            if (day == null) {
                continue;
            }
            String value = day.trim().toUpperCase();
            if (!VALID_DAYS.contains(value)) {
                throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "지원하지 않는 요일입니다: " + day);
            }
            normalized.add(value);
        }
        return List.copyOf(normalized);
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
