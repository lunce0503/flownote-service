package com.flownote.notes;

import java.sql.ResultSet;
import java.sql.SQLException;
import java.time.OffsetDateTime;
import java.util.List;
import java.util.UUID;

import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.flownote.notes.NoteDtos.NoteRequest;
import com.flownote.notes.NoteDtos.NoteResponse;
import com.flownote.notes.NoteDtos.NoteTitleUpdateRequest;

@Service
public class NoteService {
    private final JdbcTemplate jdbcTemplate;
    private final ObjectMapper objectMapper;

    public NoteService(JdbcTemplate jdbcTemplate, ObjectMapper objectMapper) {
        this.jdbcTemplate = jdbcTemplate;
        this.objectMapper = objectMapper;
    }

    public List<NoteResponse> list(UUID userId) {
        return jdbcTemplate.query("""
                SELECT id, title, content::text AS content, created_at, updated_at
                FROM notes
                WHERE user_id = ?
                ORDER BY created_at DESC
                """, this::mapNote, userId);
    }

    public NoteResponse upsert(UUID userId, NoteRequest request) {
        OffsetDateTime createdAt = request.createdAt() == null ? OffsetDateTime.now() : request.createdAt();
        return jdbcTemplate.queryForObject("""
                INSERT INTO notes (id, user_id, title, content, created_at, updated_at)
                VALUES (?, ?, ?, ?::jsonb, ?, NOW())
                ON CONFLICT (id)
                DO UPDATE SET
                    title = EXCLUDED.title,
                    content = EXCLUDED.content,
                    updated_at = NOW()
                WHERE notes.user_id = EXCLUDED.user_id
                RETURNING id, title, content::text AS content, created_at, updated_at
                """, this::mapNote, request.id(), userId, request.title(), request.content().toString(), createdAt);
    }

    public NoteResponse updateTitle(UUID userId, UUID noteId, NoteTitleUpdateRequest request) {
        return jdbcTemplate.query("""
                UPDATE notes
                SET title = ?, updated_at = NOW()
                WHERE id = ? AND user_id = ?
                RETURNING id, title, content::text AS content, created_at, updated_at
                """, this::mapNote, request.title().trim(), noteId, userId)
                .stream()
                .findFirst()
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "노트를 찾을 수 없습니다."));
    }

    @Transactional
    public NoteResponse delete(UUID userId, UUID noteId) {
        jdbcTemplate.update("""
                UPDATE note_folders
                SET note_ids = array_remove(note_ids, CAST(? AS uuid)), updated_at = NOW()
                WHERE user_id = ?
                """, noteId, userId);

        return jdbcTemplate.query("""
                DELETE FROM notes
                WHERE id = ? AND user_id = ?
                RETURNING id, title, content::text AS content, created_at, updated_at
                """, this::mapNote, noteId, userId)
                .stream()
                .findFirst()
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "노트를 찾을 수 없습니다."));
    }

    private NoteResponse mapNote(ResultSet rs, int rowNum) throws SQLException {
        return new NoteResponse(
                rs.getObject("id", UUID.class),
                rs.getString("title"),
                readJson(rs.getString("content")),
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
