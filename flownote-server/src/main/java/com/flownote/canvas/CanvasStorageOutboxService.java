package com.flownote.canvas;

import java.util.UUID;

import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;

import com.fasterxml.jackson.databind.JsonNode;

@Service
public class CanvasStorageOutboxService {
    private final JdbcTemplate jdbcTemplate;

    public CanvasStorageOutboxService(JdbcTemplate jdbcTemplate) {
        this.jdbcTemplate = jdbcTemplate;
    }

    public void enqueueElementUpload(UUID userId, UUID canvasId, String elementId,
            String objectKey, JsonNode payload, int priority) {
        jdbcTemplate.update("""
                INSERT INTO canvas_storage_jobs (
                    id, canvas_id, user_id, element_id, operation_type, object_key,
                    payload, content_type, priority
                )
                VALUES (?, ?, ?, ?, 'UPLOAD_ELEMENT', ?, ?::jsonb, 'application/json', ?)
                """, UUID.randomUUID(), canvasId, userId, elementId, objectKey, payload.toString(), priority);
    }

    public void enqueueDelete(UUID userId, UUID canvasId, String objectKey) {
        if (objectKey == null || objectKey.isBlank()) return;
        jdbcTemplate.update("""
                INSERT INTO canvas_storage_jobs (
                    id, canvas_id, user_id, operation_type, object_key, priority
                )
                VALUES (?, ?, ?, 'DELETE_OBJECT', ?, 10)
                """, UUID.randomUUID(), canvasId, userId, objectKey);
    }
}
