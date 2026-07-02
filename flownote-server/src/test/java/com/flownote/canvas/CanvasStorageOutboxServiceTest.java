package com.flownote.canvas;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyInt;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;

import java.util.UUID;

import org.junit.jupiter.api.Test;
import org.springframework.jdbc.core.JdbcTemplate;

import com.fasterxml.jackson.databind.ObjectMapper;

class CanvasStorageOutboxServiceTest {
    @Test
    void uploadIsPersistedAsAJobInsteadOfCallingObjectStorage() {
        JdbcTemplate jdbcTemplate = mock(JdbcTemplate.class);
        CanvasStorageOutboxService service = new CanvasStorageOutboxService(jdbcTemplate);

        service.enqueueElementUpload(
                UUID.randomUUID(), UUID.randomUUID(), "line-1", "canvas-elements/line-1.json",
                new ObjectMapper().createObjectNode().put("id", "line-1"), 50);

        verify(jdbcTemplate).update(anyString(), any(), any(), any(), any(), any(), anyString(), anyInt());
    }
}
