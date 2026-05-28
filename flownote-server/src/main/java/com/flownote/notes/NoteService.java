package com.flownote.notes;

import java.sql.ResultSet;
import java.sql.SQLException;
import java.time.OffsetDateTime;
import java.util.List;
import java.util.Map;
import java.util.UUID;

import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.transaction.support.TransactionSynchronization;
import org.springframework.transaction.support.TransactionSynchronizationManager;
import org.springframework.web.server.ResponseStatusException;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.flownote.canvas.CanvasAssetStorage;
import com.flownote.canvas.CanvasAssetStorage.StoredCanvasAsset;
import com.flownote.notes.NoteDtos.NoteRequest;
import com.flownote.notes.NoteDtos.NoteResponse;
import com.flownote.notes.NoteDtos.NoteTitleUpdateRequest;

@Service
public class NoteService {
    private final JdbcTemplate jdbcTemplate;
    private final ObjectMapper objectMapper;
    private final CanvasAssetStorage assetStorage;

    public NoteService(JdbcTemplate jdbcTemplate, ObjectMapper objectMapper, CanvasAssetStorage assetStorage) {
        this.jdbcTemplate = jdbcTemplate;
        this.objectMapper = objectMapper;
        this.assetStorage = assetStorage;
    }

    public List<NoteResponse> list(UUID userId) {
        return jdbcTemplate.query("""
                SELECT id, title, content::text AS content, content_object_key, created_at, updated_at
                FROM notes
                WHERE user_id = ?
                ORDER BY created_at DESC
                """, this::mapNote, userId);
    }

    public NoteResponse upsert(UUID userId, NoteRequest request) {
        OffsetDateTime createdAt = request.createdAt() == null ? OffsetDateTime.now() : request.createdAt();
        String objectKey = "note-content/%s/%s.json".formatted(userId, request.id());
        StoredCanvasAsset stored = assetStorage.putJson(objectKey, request.content().toString());
        return jdbcTemplate.queryForObject("""
                INSERT INTO notes (id, user_id, title, content, content_object_key, content_byte_size, content_public_url, created_at, updated_at)
                VALUES (?, ?, ?, '[]'::jsonb, ?, ?, ?, ?, NOW())
                ON CONFLICT (id)
                DO UPDATE SET
                    title = EXCLUDED.title,
                    content = '[]'::jsonb,
                    content_object_key = EXCLUDED.content_object_key,
                    content_byte_size = EXCLUDED.content_byte_size,
                    content_public_url = EXCLUDED.content_public_url,
                    updated_at = NOW()
                WHERE notes.user_id = EXCLUDED.user_id
                RETURNING id, title, content::text AS content, content_object_key, created_at, updated_at
                """, this::mapNote, request.id(), userId, request.title(), objectKey, stored.byteSize(), stored.publicUrl(), createdAt);
    }

    public NoteResponse updateTitle(UUID userId, UUID noteId, NoteTitleUpdateRequest request) {
        return jdbcTemplate.query("""
                UPDATE notes
                SET title = ?, updated_at = NOW()
                WHERE id = ? AND user_id = ?
                RETURNING id, title, content::text AS content, content_object_key, created_at, updated_at
                """, this::mapNote, request.title().trim(), noteId, userId)
                .stream()
                .findFirst()
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "노트를 찾을 수 없습니다."));
    }

    @Transactional
    public NoteResponse delete(UUID userId, UUID noteId) {
        Map<String, Object> note = jdbcTemplate.query("""
                SELECT id, title, content::text AS content, content_object_key, created_at, updated_at
                FROM notes
                WHERE id = ? AND user_id = ?
                """, (rs, rowNum) -> Map.<String, Object>of(
                        "id", rs.getObject("id", UUID.class),
                        "title", rs.getString("title"),
                        "content", rs.getString("content"),
                        "content_object_key", rs.getString("content_object_key") == null ? "" : rs.getString("content_object_key"),
                        "created_at", rs.getObject("created_at", OffsetDateTime.class),
                        "updated_at", rs.getObject("updated_at", OffsetDateTime.class)
                ), noteId, userId)
                .stream()
                .findFirst()
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "노트를 찾을 수 없습니다."));
        String contentObjectKey = String.valueOf(note.get("content_object_key"));
        JsonNode content = contentObjectKey.isBlank()
                ? readJson(String.valueOf(note.get("content")))
                : readJson(assetStorage.readJson(contentObjectKey));

        jdbcTemplate.update("""
                UPDATE note_folders
                SET note_ids = array_remove(note_ids, CAST(? AS uuid)), updated_at = NOW()
                WHERE user_id = ?
                """, noteId, userId);

        jdbcTemplate.update("""
                DELETE FROM notes
                WHERE id = ? AND user_id = ?
                """, noteId, userId);

        deleteAfterCommit(contentObjectKey);
        return new NoteResponse(
                (UUID) note.get("id"),
                String.valueOf(note.get("title")),
                content,
                (OffsetDateTime) note.get("created_at"),
                (OffsetDateTime) note.get("updated_at"));
    }

    private void deleteAfterCommit(String objectKey) {
        if (objectKey == null || objectKey.isBlank()) {
            return;
        }
        if (!TransactionSynchronizationManager.isActualTransactionActive()) {
            assetStorage.delete(objectKey);
            return;
        }
        TransactionSynchronizationManager.registerSynchronization(new TransactionSynchronization() {
            @Override
            public void afterCommit() {
                assetStorage.delete(objectKey);
            }
        });
    }

    private NoteResponse mapNote(ResultSet rs, int rowNum) throws SQLException {
        String contentObjectKey = rs.getString("content_object_key");
        return new NoteResponse(
                rs.getObject("id", UUID.class),
                rs.getString("title"),
                contentObjectKey == null || contentObjectKey.isBlank()
                        ? readJson(rs.getString("content"))
                        : readJson(assetStorage.readJson(contentObjectKey)),
                rs.getObject("created_at", OffsetDateTime.class),
                rs.getObject("updated_at", OffsetDateTime.class));
    }

    private JsonNode readJson(String content) {
        try {
            return objectMapper.readTree(content);
        } catch (JsonProcessingException exception) {
            throw new IllegalStateException("노트 콘텐츠를 JSON으로 읽을 수 없습니다.", exception);
        }
    }
}
