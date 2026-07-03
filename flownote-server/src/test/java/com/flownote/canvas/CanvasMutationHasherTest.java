package com.flownote.canvas;

import static org.assertj.core.api.Assertions.assertThat;

import java.util.UUID;

import org.junit.jupiter.api.Test;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ArrayNode;
import com.flownote.canvas.CanvasDtos.CanvasSaveRequest;

class CanvasMutationHasherTest {
    private final ObjectMapper objectMapper = new ObjectMapper();

    @Test
    void hashDoesNotDependOnMutationId() {
        ArrayNode addedLines = lines("line-1");

        String first = CanvasMutationHasher.hash(objectMapper, request(UUID.randomUUID(), addedLines));
        String second = CanvasMutationHasher.hash(objectMapper, request(UUID.randomUUID(), addedLines.deepCopy()));

        assertThat(first).hasSize(64).isEqualTo(second);
    }

    @Test
    void hashChangesWhenPayloadChanges() {
        ArrayNode firstLines = lines("line-1");
        ArrayNode secondLines = lines("line-2");

        String first = CanvasMutationHasher.hash(objectMapper, request(UUID.randomUUID(), firstLines));
        String second = CanvasMutationHasher.hash(objectMapper, request(UUID.randomUUID(), secondLines));

        assertThat(first).isNotEqualTo(second);
    }

    private CanvasSaveRequest request(UUID mutationId, ArrayNode addedLines) {
        ArrayNode empty = objectMapper.createArrayNode();
        return new CanvasSaveRequest(
                mutationId,
                addedLines,
                empty,
                empty,
                empty,
                empty,
                empty,
                empty,
                empty,
                empty);
    }

    private ArrayNode lines(String id) {
        ArrayNode lines = objectMapper.createArrayNode();
        lines.addObject().put("id", id);
        return lines;
    }
}
