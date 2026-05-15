package com.flownote.auth;

import java.time.OffsetDateTime;
import java.util.UUID;

import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.web.server.ResponseStatusException;

@Service
public class AuthService {
    private final JdbcTemplate jdbcTemplate;

    public AuthService(JdbcTemplate jdbcTemplate) {
        this.jdbcTemplate = jdbcTemplate;
    }

    public UUID requireUserId(String authorizationHeader) {
        UUID token = parseBearerToken(authorizationHeader);
        return jdbcTemplate.query("""
                SELECT user_id
                FROM app_sessions
                WHERE token = ? AND expires_at > ?
                """,
                (rs, rowNum) -> rs.getObject("user_id", UUID.class),
                token,
                OffsetDateTime.now())
                .stream()
                .findFirst()
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.UNAUTHORIZED, "로그인이 필요합니다."));
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
