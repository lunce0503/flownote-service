package com.flownote.canvas;

import java.sql.ResultSet;
import java.sql.SQLException;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.UUID;

import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ArrayNode;
import com.flownote.canvas.CanvasDtos.CanvasResponse;
import com.flownote.canvas.CanvasDtos.CanvasSaveRequest;

@Service
public class CanvasService {
    private final JdbcTemplate jdbcTemplate;
    private final ObjectMapper objectMapper;

    public CanvasService(JdbcTemplate jdbcTemplate, ObjectMapper objectMapper) {
        this.jdbcTemplate = jdbcTemplate;
        this.objectMapper = objectMapper;
    }

    public CanvasResponse load(UUID userId) {
        return jdbcTemplate.query("""
                SELECT lines::text AS lines, images::text AS images, text_boxes::text AS text_boxes
                FROM canvas_documents
                WHERE user_id = ?
                LIMIT 1
                """, this::mapCanvas, userId)
                .stream()
                .findFirst()
                .orElseGet(() -> new CanvasResponse(emptyArray(), emptyArray(), emptyArray()));
    }

    public CanvasResponse save(UUID userId, CanvasSaveRequest request) {
        CanvasResponse current = load(userId);
        JsonNode lines = merge(current.lines(), request.addedLines(), request.modifiedLines(), request.deletedLines());
        JsonNode images = merge(current.images(), request.addedImages(), request.modifiedImages(), request.deletedImages());
        JsonNode textBoxes = merge(current.textBoxes(), request.addedTextBoxes(), request.modifiedTextBoxes(), request.deletedTextBoxes());

        return jdbcTemplate.queryForObject("""
                INSERT INTO canvas_documents (user_id, lines, images, text_boxes, updated_at)
                VALUES (?, ?::jsonb, ?::jsonb, ?::jsonb, NOW())
                ON CONFLICT (user_id)
                DO UPDATE SET
                    lines = EXCLUDED.lines,
                    images = EXCLUDED.images,
                    text_boxes = EXCLUDED.text_boxes,
                    updated_at = NOW()
                RETURNING lines::text AS lines, images::text AS images, text_boxes::text AS text_boxes
                """, this::mapCanvas, userId, lines.toString(), images.toString(), textBoxes.toString());
    }

    private JsonNode merge(JsonNode current, JsonNode added, JsonNode modified, JsonNode deleted) {
        Map<String, JsonNode> byId = new LinkedHashMap<>();
        currentArray(current).forEach(item -> {
            JsonNode id = item.get("id");
            if (id != null && id.isTextual()) {
                byId.put(id.asText(), item);
            }
        });

        currentArray(deleted).forEach(item -> {
            JsonNode id = item.get("id");
            if (id != null && id.isTextual()) {
                byId.remove(id.asText());
            }
        });

        currentArray(modified).forEach(item -> putById(byId, item));
        currentArray(added).forEach(item -> putById(byId, item));

        ArrayNode merged = objectMapper.createArrayNode();
        byId.values().forEach(merged::add);
        return merged;
    }

    private void putById(Map<String, JsonNode> byId, JsonNode item) {
        JsonNode id = item.get("id");
        if (id != null && id.isTextual()) {
            byId.put(id.asText(), item);
        }
    }

    private Iterable<JsonNode> currentArray(JsonNode node) {
        return node != null && node.isArray() ? node : emptyArray();
    }

    private ArrayNode emptyArray() {
        return objectMapper.createArrayNode();
    }

    private CanvasResponse mapCanvas(ResultSet rs, int rowNum) throws SQLException {
        return new CanvasResponse(
                readJson(rs.getString("lines")),
                readJson(rs.getString("images")),
                readJson(rs.getString("text_boxes")));
    }

    private JsonNode readJson(String value) {
        try {
            return value == null ? emptyArray() : objectMapper.readTree(value);
        } catch (Exception exception) {
            throw new IllegalStateException("캔버스 데이터를 JSON으로 읽을 수 없습니다.", exception);
        }
    }
}
