package com.flownote.notes;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

import java.util.List;
import java.util.UUID;

import org.junit.jupiter.api.Test;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.core.RowMapper;
import org.springframework.web.server.ResponseStatusException;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ArrayNode;
import com.flownote.canvas.CanvasAssetStorage;
import com.flownote.canvas.CanvasAssetStorage.StoredCanvasAsset;
import com.flownote.notes.NoteDtos.NoteRequest;

class NoteRevisionConflictTest {
    @SuppressWarnings({"rawtypes", "unchecked"})
    @Test
    void staleRevisionIsRejectedAfterWritingToAnIsolatedObjectKey() {
        JdbcTemplate jdbcTemplate = mock(JdbcTemplate.class);
        CanvasAssetStorage assetStorage = mock(CanvasAssetStorage.class);
        NoteService service = new NoteService(jdbcTemplate, new ObjectMapper(), assetStorage);
        UUID userId = UUID.randomUUID();
        UUID noteId = UUID.randomUUID();
        String clientId = "browser-session-a";
        ArrayNode content = new ObjectMapper().createArrayNode();
        NoteRequest request = new NoteRequest(noteId, "title", content, null, 4L, clientId);

        when(assetStorage.putJson(anyString(), anyString()))
                .thenAnswer(invocation -> new StoredCanvasAsset(
                        invocation.getArgument(0), "application/json", 2L, ""));
        when(jdbcTemplate.query(anyString(), any(RowMapper.class), any(Object[].class)))
                .thenReturn(List.of());

        assertThatThrownBy(() -> service.upsert(userId, request))
                .isInstanceOfSatisfying(ResponseStatusException.class, exception ->
                        assertThat(exception.getStatusCode()).isEqualTo(HttpStatus.CONFLICT));

        String objectKey = NoteService.contentObjectKey(userId, noteId, 4L, clientId);
        assertThat(objectKey).contains("/4-").doesNotContain("browser-session-a");
    }

    @Test
    void objectKeysDifferForClientsSavingTheSameRevision() {
        UUID userId = UUID.randomUUID();
        UUID noteId = UUID.randomUUID();

        String first = NoteService.contentObjectKey(userId, noteId, 7L, "client-a");
        String second = NoteService.contentObjectKey(userId, noteId, 7L, "client-b");

        assertThat(first).isNotEqualTo(second);
    }
}
