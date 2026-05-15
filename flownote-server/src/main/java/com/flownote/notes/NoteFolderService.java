package com.flownote.notes;

import java.sql.Array;
import java.sql.PreparedStatement;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.time.OffsetDateTime;
import java.util.Arrays;
import java.util.List;
import java.util.UUID;

import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

import com.flownote.notes.NoteFolderDtos.NoteFolderRequest;
import com.flownote.notes.NoteFolderDtos.NoteFolderResponse;
import com.flownote.notes.NoteFolderDtos.NoteFolderUpdateRequest;

@Service
public class NoteFolderService {
    private final JdbcTemplate jdbcTemplate;

    public NoteFolderService(JdbcTemplate jdbcTemplate) {
        this.jdbcTemplate = jdbcTemplate;
    }

    public List<NoteFolderResponse> list(UUID userId) {
        return jdbcTemplate.query("""
                SELECT id, category, name, note_ids, created_at, updated_at
                FROM note_folders
                WHERE user_id = ?
                ORDER BY category ASC, name ASC, created_at DESC
                """, this::mapFolder, userId);
    }

    public NoteFolderResponse create(UUID userId, NoteFolderRequest request) {
        List<UUID> ownedNoteIds = filterOwnedNoteIds(userId, request.noteIds());
        return jdbcTemplate.query(connection -> {
            PreparedStatement ps = connection.prepareStatement("""
                    INSERT INTO note_folders (id, user_id, category, name, note_ids)
                    VALUES (?, ?, ?, ?, ?)
                    RETURNING id, category, name, note_ids, created_at, updated_at
                    """);
            ps.setObject(1, UUID.randomUUID());
            ps.setObject(2, userId);
            ps.setString(3, normalizeCategory(request.category()));
            ps.setString(4, request.name().trim());
            ps.setArray(5, connection.createArrayOf("uuid", ownedNoteIds.toArray(UUID[]::new)));
            return ps;
        }, this::mapFolder).get(0);
    }

    public NoteFolderResponse update(UUID userId, UUID folderId, NoteFolderUpdateRequest request) {
        NoteFolderResponse current = get(userId, folderId);
        String category = request.category() == null ? current.category() : normalizeCategory(request.category());
        String name = request.name() == null || request.name().isBlank() ? current.name() : request.name().trim();
        List<UUID> noteIds = request.noteIds() == null ? current.noteIds() : filterOwnedNoteIds(userId, request.noteIds());

        return jdbcTemplate.query(connection -> {
            PreparedStatement ps = connection.prepareStatement("""
                    UPDATE note_folders
                    SET category = ?, name = ?, note_ids = ?, updated_at = NOW()
                    WHERE id = ? AND user_id = ?
                    RETURNING id, category, name, note_ids, created_at, updated_at
                    """);
            ps.setString(1, category);
            ps.setString(2, name);
            ps.setArray(3, connection.createArrayOf("uuid", noteIds.toArray(UUID[]::new)));
            ps.setObject(4, folderId);
            ps.setObject(5, userId);
            return ps;
        }, this::mapFolder)
                .stream()
                .findFirst()
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "노트 폴더를 찾을 수 없습니다."));
    }

    public void delete(UUID userId, UUID folderId) {
        int deleted = jdbcTemplate.update("DELETE FROM note_folders WHERE id = ? AND user_id = ?", folderId, userId);
        if (deleted == 0) {
            throw new ResponseStatusException(HttpStatus.NOT_FOUND, "노트 폴더를 찾을 수 없습니다.");
        }
    }

    @Transactional
    public NoteFolderResponse addNote(UUID userId, UUID folderId, UUID noteId) {
        requireOwnedNote(userId, noteId);
        get(userId, folderId);

        jdbcTemplate.update("""
                UPDATE note_folders
                SET note_ids = array_remove(note_ids, CAST(? AS uuid)), updated_at = NOW()
                WHERE user_id = ?
                """, noteId, userId);

        return jdbcTemplate.query("""
                UPDATE note_folders
                SET note_ids = array_append(note_ids, CAST(? AS uuid)), updated_at = NOW()
                WHERE id = ? AND user_id = ? AND NOT (CAST(? AS uuid) = ANY(note_ids))
                RETURNING id, category, name, note_ids, created_at, updated_at
                """, this::mapFolder, noteId, folderId, userId, noteId)
                .stream()
                .findFirst()
                .orElseGet(() -> get(userId, folderId));
    }

    public NoteFolderResponse removeNote(UUID userId, UUID folderId, UUID noteId) {
        get(userId, folderId);
        return jdbcTemplate.query("""
                UPDATE note_folders
                SET note_ids = array_remove(note_ids, CAST(? AS uuid)), updated_at = NOW()
                WHERE id = ? AND user_id = ?
                RETURNING id, category, name, note_ids, created_at, updated_at
                """, this::mapFolder, noteId, folderId, userId)
                .stream()
                .findFirst()
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "노트 폴더를 찾을 수 없습니다."));
    }

    private NoteFolderResponse get(UUID userId, UUID folderId) {
        return jdbcTemplate.query("""
                SELECT id, category, name, note_ids, created_at, updated_at
                FROM note_folders
                WHERE id = ? AND user_id = ?
                """, this::mapFolder, folderId, userId)
                .stream()
                .findFirst()
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "노트 폴더를 찾을 수 없습니다."));
    }

    private void requireOwnedNote(UUID userId, UUID noteId) {
        Boolean exists = jdbcTemplate.queryForObject("""
                SELECT EXISTS (
                    SELECT 1 FROM notes WHERE id = ? AND user_id = ?
                )
                """, Boolean.class, noteId, userId);
        if (!Boolean.TRUE.equals(exists)) {
            throw new ResponseStatusException(HttpStatus.NOT_FOUND, "노트를 찾을 수 없습니다.");
        }
    }

    private List<UUID> filterOwnedNoteIds(UUID userId, List<UUID> noteIds) {
        if (noteIds == null || noteIds.isEmpty()) {
            return List.of();
        }

        return jdbcTemplate.query(connection -> {
            PreparedStatement ps = connection.prepareStatement("""
                    SELECT id
                    FROM notes
                    WHERE user_id = ? AND id = ANY(?)
                    ORDER BY created_at DESC
                    """);
            ps.setObject(1, userId);
            ps.setArray(2, connection.createArrayOf("uuid", noteIds.toArray(UUID[]::new)));
            return ps;
        }, (rs, rowNum) -> rs.getObject("id", UUID.class));
    }

    private NoteFolderResponse mapFolder(ResultSet rs, int rowNum) throws SQLException {
        return new NoteFolderResponse(
                rs.getObject("id", UUID.class),
                rs.getString("category"),
                rs.getString("name"),
                readUuidArray(rs.getArray("note_ids")),
                rs.getObject("created_at", OffsetDateTime.class),
                rs.getObject("updated_at", OffsetDateTime.class));
    }

    private List<UUID> readUuidArray(Array array) throws SQLException {
        if (array == null) {
            return List.of();
        }
        Object value = array.getArray();
        if (value instanceof UUID[] uuidArray) {
            return Arrays.asList(uuidArray);
        }
        if (value instanceof Object[] objectArray) {
            return Arrays.stream(objectArray)
                    .map(item -> item instanceof UUID uuid ? uuid : UUID.fromString(item.toString()))
                    .toList();
        }
        return List.of();
    }

    private String normalizeCategory(String category) {
        return category == null ? "" : category.trim();
    }
}
