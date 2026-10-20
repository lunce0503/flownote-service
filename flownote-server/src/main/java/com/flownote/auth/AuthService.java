package com.flownote.auth;

import java.time.OffsetDateTime;
import java.util.UUID;

import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.web.server.ResponseStatusException;

@Service
public class AuthService {
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

        // The database is authoritative, including revocation and role changes.
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

        return user;
    }

    public void logout(String authorizationHeader) {
        UUID token = parseBearerToken(authorizationHeader);
        jdbcTemplate.update("DELETE FROM app_sessions WHERE token = ?", token);
        invalidateLegacyCache(token);
    }

    public void logoutAll(String authorizationHeader) {
        UUID userId = requireUserId(authorizationHeader);
        var tokens = jdbcTemplate.query("DELETE FROM app_sessions WHERE user_id = ? RETURNING token",
                (rs, rowNum) -> rs.getObject("token", UUID.class), userId);
        tokens.forEach(this::invalidateLegacyCache);
    }

    private void invalidateLegacyCache(UUID token) {
        try {
            redisTemplate.delete("session:" + token);
        } catch (RuntimeException ignored) {
            // All services check the DB, so Redis failure cannot restore a session.
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
