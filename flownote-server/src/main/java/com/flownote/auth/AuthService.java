package com.flownote.auth;

import java.time.Duration;
import java.time.OffsetDateTime;
import java.util.UUID;

import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.web.server.ResponseStatusException;

@Service
public class AuthService {
    /**
     * 세션 캐시 TTL. 로그아웃 엔드포인트가 없어 세션은 expires_at으로만 만료되므로
     * 만료 직후 최대 이 시간만큼의 오차만 허용한다(요청마다의 DB 왕복 제거가 목적).
     * Go 백엔드(flownote-canvas/flownote-serve)와 같은 키 형식(session:{token})을 공유한다.
     */
    private static final Duration SESSION_CACHE_TTL = Duration.ofMinutes(5);

    private final JdbcTemplate jdbcTemplate;
    private final StringRedisTemplate redisTemplate;

    public AuthService(JdbcTemplate jdbcTemplate, StringRedisTemplate redisTemplate) {
        this.jdbcTemplate = jdbcTemplate;
        this.redisTemplate = redisTemplate;
    }

    public UUID requireUserId(String authorizationHeader) {
        return requireUser(authorizationHeader).userId();
    }

    public AuthenticatedUser requireAdmin(String authorizationHeader) {
        AuthenticatedUser user = requireUser(authorizationHeader);
        if (!"ADMIN".equals(user.role())) {
            throw new ResponseStatusException(HttpStatus.FORBIDDEN, "관리자 권한이 필요합니다.");
        }
        return user;
    }

    public AuthenticatedUser requireUser(String authorizationHeader) {
        UUID token = parseBearerToken(authorizationHeader);

        AuthenticatedUser cached = cacheGet(token);
        if (cached != null) {
            return cached;
        }

        AuthenticatedUser user = jdbcTemplate.query("""
                SELECT s.user_id, u.role
                FROM app_sessions s
                JOIN users u ON u.id = s.user_id
                WHERE s.token = ? AND s.expires_at > ?
                """,
                (rs, rowNum) -> new AuthenticatedUser(
                        rs.getObject("user_id", UUID.class),
                        rs.getString("role")),
                token,
                OffsetDateTime.now())
                .stream()
                .findFirst()
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.UNAUTHORIZED, "로그인이 필요합니다."));

        cacheSet(token, user);
        return user;
    }

    // Redis 장애는 인증을 막지 않는다 — 조용히 DB 폴백.
    private AuthenticatedUser cacheGet(UUID token) {
        try {
            String cached = redisTemplate.opsForValue().get("session:" + token);
            if (cached == null) {
                return null;
            }
            int sep = cached.indexOf('|');
            if (sep <= 0) {
                return null;
            }
            return new AuthenticatedUser(UUID.fromString(cached.substring(0, sep)), cached.substring(sep + 1));
        } catch (RuntimeException ignored) {
            return null;
        }
    }

    private void cacheSet(UUID token, AuthenticatedUser user) {
        try {
            redisTemplate.opsForValue().set("session:" + token, user.userId() + "|" + user.role(), SESSION_CACHE_TTL);
        } catch (RuntimeException ignored) {
            // 캐시 실패는 무시
        }
    }

    public record AuthenticatedUser(UUID userId, String role) {
    }

    private UUID parseBearerToken(String authorizationHeader) {
        if (authorizationHeader == null || !authorizationHeader.startsWith("Bearer ")) {
            throw new ResponseStatusException(HttpStatus.UNAUTHORIZED, "로그인이 필요합니다.");
        }

        try {
            return UUID.fromString(authorizationHeader.substring("Bearer ".length()).trim());
        } catch (IllegalArgumentException exception) {
            throw new ResponseStatusException(HttpStatus.UNAUTHORIZED, "로그인이 필요합니다.");
        }
    }
}
