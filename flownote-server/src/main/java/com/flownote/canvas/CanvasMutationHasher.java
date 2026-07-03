package com.flownote.canvas;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.util.HexFormat;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ObjectNode;
import com.flownote.canvas.CanvasDtos.CanvasSaveRequest;

final class CanvasMutationHasher {
    private CanvasMutationHasher() {
    }

    static String hash(ObjectMapper objectMapper, CanvasSaveRequest request) {
        ObjectNode payload = objectMapper.createObjectNode();
        payload.set("addedLines", normalizedArray(objectMapper, request.addedLines()));
        payload.set("modifiedLines", normalizedArray(objectMapper, request.modifiedLines()));
        payload.set("deletedLines", normalizedArray(objectMapper, request.deletedLines()));
        payload.set("addedImages", normalizedArray(objectMapper, request.addedImages()));
        payload.set("modifiedImages", normalizedArray(objectMapper, request.modifiedImages()));
        payload.set("deletedImages", normalizedArray(objectMapper, request.deletedImages()));
        payload.set("addedTextBoxes", normalizedArray(objectMapper, request.addedTextBoxes()));
        payload.set("modifiedTextBoxes", normalizedArray(objectMapper, request.modifiedTextBoxes()));
        payload.set("deletedTextBoxes", normalizedArray(objectMapper, request.deletedTextBoxes()));
        try {
            byte[] digest = MessageDigest.getInstance("SHA-256")
                    .digest(payload.toString().getBytes(StandardCharsets.UTF_8));
            return HexFormat.of().formatHex(digest);
        } catch (NoSuchAlgorithmException exception) {
            throw new IllegalStateException("SHA-256 is not available", exception);
        }
    }

    private static JsonNode normalizedArray(ObjectMapper objectMapper, JsonNode node) {
        return node != null && node.isArray() ? node : objectMapper.createArrayNode();
    }
}

