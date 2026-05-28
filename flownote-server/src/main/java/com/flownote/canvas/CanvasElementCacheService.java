package com.flownote.canvas;

import java.time.Duration;
import java.util.Optional;
import java.util.UUID;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.dao.EmptyResultDataAccessException;
import org.springframework.data.redis.core.Cursor;
import org.springframework.data.redis.core.ScanOptions;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ObjectNode;
import com.flownote.canvas.CanvasDtos.CanvasElementsResponse;

@Service
public class CanvasElementCacheService {
    private static final String KEY_PREFIX = "canvas:elements:v1";

    private final JdbcTemplate jdbcTemplate;
    private final ObjectMapper objectMapper;
    private final StringRedisTemplate redisTemplate;
    private final String targetUsername;
    private final Duration ttl;

    public CanvasElementCacheService(
            JdbcTemplate jdbcTemplate,
            ObjectMapper objectMapper,
            StringRedisTemplate redisTemplate,
            @Value("${flownote.canvas.cache.target-username:lunce}") String targetUsername,
            @Value("${flownote.canvas.cache.ttl:24h}") Duration ttl) {
        this.jdbcTemplate = jdbcTemplate;
        this.objectMapper = objectMapper;
        this.redisTemplate = redisTemplate;
        this.targetUsername = targetUsername == null ? "" : targetUsername.trim();
        this.ttl = ttl == null || ttl.isNegative() || ttl.isZero() ? Duration.ofHours(24) : ttl;
    }

    public Optional<CanvasElementsResponse> get(UUID userId, UUID canvasId, long revision) {
        if (!isCacheTarget(userId, canvasId)) {
            return Optional.empty();
        }

        try {
            String raw = redisTemplate.opsForValue().get(cacheKey(userId, canvasId, revision));
            if (raw == null || raw.isBlank()) {
                return Optional.empty();
            }

            JsonNode node = objectMapper.readTree(raw);
            return Optional.of(new CanvasElementsResponse(
                    arrayOrEmpty(node.path("lines")),
                    arrayOrEmpty(node.path("images")),
                    arrayOrEmpty(node.path("textBoxes"))));
        } catch (Exception exception) {
            return Optional.empty();
        }
    }

    public void put(UUID userId, UUID canvasId, long revision, CanvasElementsResponse elements) {
        if (!isCacheTarget(userId, canvasId)) {
            return;
        }

        try {
            ObjectNode node = objectMapper.createObjectNode();
            node.set("lines", elements.lines());
            node.set("images", elements.images());
            node.set("textBoxes", elements.textBoxes());
            redisTemplate.opsForValue().set(cacheKey(userId, canvasId, revision), node.toString(), ttl);
        } catch (Exception exception) {
            // Redis is an optimization only. R2/DB remains the source of truth.
        }
    }

    public void invalidate(UUID userId, UUID canvasId) {
        if (!isLikelyTargetUser(userId)) {
            return;
        }

        try {
            try (Cursor<String> keys = redisTemplate.scan(ScanOptions.scanOptions()
                    .match(cacheKeyPattern(userId, canvasId))
                    .count(20)
                    .build())) {
                keys.forEachRemaining(redisTemplate::delete);
            }
        } catch (Exception exception) {
            // Best effort cleanup. Revisioned keys also prevent stale reads.
        }
    }

    private boolean isCacheTarget(UUID userId, UUID canvasId) {
        if (!isLikelyTargetUser(userId)) {
            return false;
        }

        try {
            UUID largestCanvasId = jdbcTemplate.query("""
                    SELECT element.canvas_id
                    FROM canvas_elements element
                    WHERE element.user_id = ?
                      AND element.type IN ('line', 'image')
                    GROUP BY element.canvas_id
                    ORDER BY SUM(COALESCE(element.byte_size, octet_length(element.payload::text))) DESC
                    LIMIT 1
                    """, (rs, rowNum) -> rs.getObject("canvas_id", UUID.class), userId)
                    .stream()
                    .findFirst()
                    .orElse(null);
            return canvasId.equals(largestCanvasId);
        } catch (Exception exception) {
            return false;
        }
    }

    private boolean isLikelyTargetUser(UUID userId) {
        if (targetUsername.isBlank()) {
            return false;
        }

        try {
            String username = jdbcTemplate.queryForObject("""
                    SELECT username
                    FROM users
                    WHERE id = ?
                    """, String.class, userId);
            return username != null && username.equalsIgnoreCase(targetUsername);
        } catch (EmptyResultDataAccessException exception) {
            return false;
        }
    }

    private JsonNode arrayOrEmpty(JsonNode node) {
        return node != null && node.isArray() ? node : objectMapper.createArrayNode();
    }

    private String cacheKey(UUID userId, UUID canvasId, long revision) {
        return "%s:%s:%s:rev:%d".formatted(KEY_PREFIX, userId, canvasId, revision);
    }

    private String cacheKeyPattern(UUID userId, UUID canvasId) {
        return "%s:%s:%s:*".formatted(KEY_PREFIX, userId, canvasId);
    }
}
