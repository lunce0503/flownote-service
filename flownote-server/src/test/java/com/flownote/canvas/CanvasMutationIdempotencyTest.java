package com.flownote.canvas;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;

import java.sql.ResultSet;
import java.util.List;
import java.util.UUID;

import org.junit.jupiter.api.Test;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.core.RowMapper;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ArrayNode;
import com.flownote.canvas.CanvasDtos.CanvasSaveRequest;
import com.flownote.canvas.CanvasDtos.CanvasSaveResponse;

class CanvasMutationIdempotencyTest {
    @SuppressWarnings({"rawtypes", "unchecked"})
    @Test
    void completedMutationReturnsPreviousRevisionWithoutWritingAssetsAgain() throws Exception {
        JdbcTemplate jdbcTemplate = mock(JdbcTemplate.class);
        CanvasAssetStorage assetStorage = mock(CanvasAssetStorage.class);
        CanvasElementCacheService cacheService = mock(CanvasElementCacheService.class);
        CanvasStorageOutboxService outboxService = mock(CanvasStorageOutboxService.class);
        ObjectMapper objectMapper = new ObjectMapper();
        CanvasService service = new CanvasService(jdbcTemplate, objectMapper, assetStorage, cacheService, outboxService);
        UUID userId = UUID.randomUUID();
        UUID canvasId = UUID.randomUUID();
        UUID mutationId = UUID.randomUUID();
        CanvasSaveRequest request = emptyRequest(objectMapper, mutationId);
        String payloadHash = CanvasMutationHasher.hash(objectMapper, request);

        when(jdbcTemplate.queryForObject(anyString(), eq(Boolean.class), eq(canvasId), eq(userId)))
                .thenReturn(true);
        when(jdbcTemplate.query(anyString(), any(RowMapper.class), eq(canvasId), eq(mutationId), eq(userId)))
                .thenAnswer(invocation -> {
                    RowMapper mapper = invocation.getArgument(1);
                    ResultSet resultSet = mock(ResultSet.class);
                    when(resultSet.getString("payload_hash")).thenReturn(payloadHash);
                    when(resultSet.getString("status")).thenReturn("COMPLETED");
                    when(resultSet.getObject("result_revision", Long.class)).thenReturn(42L);
                    return List.of(mapper.mapRow(resultSet, 0));
                });

        CanvasSaveResponse response = service.saveElements(userId, canvasId, request);

        assertThat(response.mutationId()).isEqualTo(mutationId);
        assertThat(response.revision()).isEqualTo(42L);
        assertThat(response.duplicate()).isTrue();
        verifyNoInteractions(assetStorage, cacheService);
    }

    private CanvasSaveRequest emptyRequest(ObjectMapper objectMapper, UUID mutationId) {
        ArrayNode empty = objectMapper.createArrayNode();
        return new CanvasSaveRequest(
                mutationId,
                empty,
                empty,
                empty,
                empty,
                empty,
                empty,
                empty,
                empty,
                empty);
    }
}
