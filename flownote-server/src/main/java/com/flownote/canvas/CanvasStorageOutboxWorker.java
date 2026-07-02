package com.flownote.canvas;

import java.time.OffsetDateTime;
import java.util.List;
import java.util.Map;
import java.util.UUID;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;

import com.flownote.canvas.CanvasAssetStorage.StoredCanvasAsset;

@Service
public class CanvasStorageOutboxWorker {
    private static final Logger log = LoggerFactory.getLogger(CanvasStorageOutboxWorker.class);
    private static final int MAX_ATTEMPTS = 8;

    private final JdbcTemplate jdbcTemplate;
    private final CanvasAssetStorage assetStorage;

    public CanvasStorageOutboxWorker(JdbcTemplate jdbcTemplate, CanvasAssetStorage assetStorage) {
        this.jdbcTemplate = jdbcTemplate;
        this.assetStorage = assetStorage;
    }

    @Scheduled(fixedDelayString = "${flownote.canvas.storage-worker-delay-ms:1000}")
    public void processReadyJobs() {
        for (int index = 0; index < 20; index += 1) {
            Map<String, Object> job = claimNextJob();
            if (job == null) return;
            process(job);
        }
    }

    public void retry(UUID jobId) {
        jdbcTemplate.update("""
                UPDATE canvas_storage_jobs
                SET status = 'PENDING', next_attempt_at = NOW(), lease_until = NULL,
                    last_error_code = NULL, last_error_message = NULL, updated_at = NOW()
                WHERE id = ? AND status = 'FAILED'
                """, jobId);
    }

    private Map<String, Object> claimNextJob() {
        List<Map<String, Object>> rows = jdbcTemplate.queryForList("""
                UPDATE canvas_storage_jobs
                SET status = 'PROCESSING', lease_until = NOW() + INTERVAL '30 seconds',
                    attempts = attempts + 1, updated_at = NOW()
                WHERE id = (
                    SELECT id FROM canvas_storage_jobs
                    WHERE (status = 'PENDING' AND next_attempt_at <= NOW())
                       OR (status = 'PROCESSING' AND lease_until < NOW())
                    ORDER BY priority DESC, next_attempt_at ASC, created_at ASC
                    FOR UPDATE SKIP LOCKED LIMIT 1
                )
                RETURNING id, canvas_id, user_id, element_id, operation_type,
                          object_key, payload::text AS payload, attempts
                """);
        return rows.isEmpty() ? null : rows.get(0);
    }

    private void process(Map<String, Object> job) {
        UUID jobId = (UUID) job.get("id");
        String operationType = String.valueOf(job.get("operation_type"));
        String objectKey = String.valueOf(job.get("object_key"));
        try {
            if ("UPLOAD_ELEMENT".equals(operationType)) {
                StoredCanvasAsset stored = assetStorage.putJson(objectKey, String.valueOf(job.get("payload")));
                jdbcTemplate.update("""
                        UPDATE canvas_elements
                        SET storage_status = 'READY', storage_error_code = NULL,
                            byte_size = ?, public_url = ?, r2_synced_at = NOW(), updated_at = NOW()
                        WHERE canvas_id = ? AND user_id = ? AND id = ? AND object_key = ?
                        """, stored.byteSize(), stored.publicUrl(), job.get("canvas_id"), job.get("user_id"),
                        job.get("element_id"), objectKey);
            } else if ("DELETE_OBJECT".equals(operationType)) {
                assetStorage.delete(objectKey);
            } else {
                throw new IllegalArgumentException("지원하지 않는 storage job입니다: " + operationType);
            }
            jdbcTemplate.update("""
                    UPDATE canvas_storage_jobs
                    SET status = 'COMPLETED', completed_at = NOW(), lease_until = NULL,
                        last_error_code = NULL, last_error_message = NULL, updated_at = NOW()
                    WHERE id = ?
                    """, jobId);
        } catch (RuntimeException exception) {
            int attempts = ((Number) job.get("attempts")).intValue();
            boolean exhausted = attempts >= MAX_ATTEMPTS;
            String errorCode = exception.getClass().getSimpleName();
            jdbcTemplate.update("""
                    UPDATE canvas_storage_jobs
                    SET status = ?, next_attempt_at = ?, lease_until = NULL,
                        last_error_code = ?, last_error_message = ?, updated_at = NOW()
                    WHERE id = ?
                    """, exhausted ? "FAILED" : "PENDING",
                    OffsetDateTime.now().plusSeconds(Math.min(300, 1L << Math.min(attempts, 8))),
                    errorCode, safeMessage(exception), jobId);
            if ("UPLOAD_ELEMENT".equals(operationType)) {
                jdbcTemplate.update("""
                        UPDATE canvas_elements
                        SET storage_status = ?, storage_error_code = ?, updated_at = NOW()
                        WHERE canvas_id = ? AND user_id = ? AND id = ? AND object_key = ?
                        """, exhausted ? "FAILED" : "PENDING", errorCode, job.get("canvas_id"), job.get("user_id"),
                        job.get("element_id"), objectKey);
            }
            log.warn("canvas_storage_job_failed jobId={} operation={} attempts={} exhausted={}",
                    jobId, operationType, attempts, exhausted, exception);
        }
    }

    private String safeMessage(RuntimeException exception) {
        String message = exception.getMessage();
        if (message == null || message.isBlank()) return exception.getClass().getSimpleName();
        return message.length() > 1000 ? message.substring(0, 1000) : message;
    }
}
