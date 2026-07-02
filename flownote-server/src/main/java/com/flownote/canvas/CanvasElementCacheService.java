package com.flownote.canvas;

import java.time.Duration;
import java.util.Optional;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;

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
    private final ConcurrentHashMap<UUID, CacheTargetSnapshot> targetSnapshots = new ConcurrentHashMap<>();

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
                    arrayOrEmpty(node.path("textBoxes")),
                    revision,
                    "COMPLETE",
                    "REDIS",
                    List.of(),
                    List.of(),
                    Map.of()));
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
        CacheTargetSnapshot snapshot = cacheTargetSnapshot(userId);
        return snapshot.targetUser() && canvasId.equals(snapshot.largestCanvasId());
    }

    private boolean isLikelyTargetUser(UUID userId) {
        return cacheTargetSnapshot(userId).targetUser();
    }

    private CacheTargetSnapshot cacheTargetSnapshot(UUID userId) {
        if (targetUsername.isBlank()) return new CacheTargetSnapshot(false, null, Long.MAX_VALUE);
        CacheTargetSnapshot cached = targetSnapshots.get(userId);
        long now = System.currentTimeMillis();
        if (cached != null && cached.expiresAt() > now) return cached;
        try {
            CacheTargetSnapshot resolved = jdbcTemplate.query("""
                    SELECT u.username,
                           (SELECT element.canvas_id
                            FROM canvas_elements element
                            WHERE element.user_id = u.id AND element.type IN ('line', 'image')
                            GROUP BY element.canvas_id
                            ORDER BY SUM(COALESCE(element.byte_size, octet_length(element.payload::text))) DESC
                            LIMIT 1) AS largest_canvas_id
                    FROM users u
                    WHERE u.id = ?
                    """, (rs, rowNum) -> new CacheTargetSnapshot(
                            rs.getString("username").equalsIgnoreCase(targetUsername),
                            rs.getObject("largest_canvas_id", UUID.class),
                            now + Duration.ofMinutes(5).toMillis()), userId)
                    .stream().findFirst()
                    .orElse(new CacheTargetSnapshot(false, null, now + Duration.ofMinutes(5).toMillis()));
            targetSnapshots.put(userId, resolved);
            return resolved;
        } catch (Exception exception) {
            return new CacheTargetSnapshot(false, null, now + Duration.ofSeconds(30).toMillis());
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

    private record CacheTargetSnapshot(boolean targetUser, UUID largestCanvasId, long expiresAt) {
    }
}
