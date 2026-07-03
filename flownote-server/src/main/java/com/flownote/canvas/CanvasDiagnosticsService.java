package com.flownote.canvas;

import java.util.List;
import java.util.Map;
import java.util.UUID;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;

@Service
public class CanvasDiagnosticsService {
    private static final Logger log = LoggerFactory.getLogger(CanvasDiagnosticsService.class);
    private final JdbcTemplate jdbcTemplate;

    public CanvasDiagnosticsService(JdbcTemplate jdbcTemplate) {
        this.jdbcTemplate = jdbcTemplate;
    }

    public void record(UUID requestId, UUID mutationId, UUID userId, UUID canvasId,
            String operationType, String trigger, int priority, String status,
            String errorCode, long queueMs, long totalMs, Long payloadBytes) {
        try {
            jdbcTemplate.update("""
                    INSERT INTO canvas_operation_events (
                        request_id, mutation_id, user_id, canvas_id, operation_type,
                        trigger_type, priority, status, error_code, queue_ms, total_ms, payload_bytes
                    )
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                    """, requestId, mutationId, userId, canvasId, operationType, trigger, priority,
                    status, errorCode, queueMs, totalMs, payloadBytes);
        } catch (RuntimeException exception) {
            log.warn("canvas_diagnostic_record_failed requestId={} operation={}", requestId, operationType);
        }
    }

    public List<Map<String, Object>> recentEvents(int limit) {
        return jdbcTemplate.queryForList("""
                SELECT id, request_id, mutation_id, canvas_id, operation_type, trigger_type,
                       priority, status, error_code, queue_ms, db_ms, r2_ms, total_ms,
                       payload_bytes, created_at
                FROM canvas_operation_events
                WHERE created_at >= NOW() - INTERVAL '30 days'
                ORDER BY created_at DESC
                LIMIT ?
                """, Math.max(1, Math.min(limit, 200)));
    }

    public Map<String, Object> storageJobSummary() {
        List<Map<String, Object>> counts = jdbcTemplate.queryForList("""
                SELECT status, COUNT(*) AS count
                FROM canvas_storage_jobs
                GROUP BY status
                """);
        return Map.of("counts", counts);
    }

    public void deleteExpiredEvents() {
        jdbcTemplate.update("DELETE FROM canvas_operation_events WHERE created_at < NOW() - INTERVAL '30 days'");
    }
}
