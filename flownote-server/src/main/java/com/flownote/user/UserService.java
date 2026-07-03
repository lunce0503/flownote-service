package com.flownote.user;

import java.time.OffsetDateTime;
import java.util.List;
import java.util.UUID;

import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.web.server.ResponseStatusException;

import com.flownote.user.UserDtos.LoginRequest;
import com.flownote.user.UserDtos.LoginResponse;
import com.flownote.user.UserDtos.RegisterRequest;
import com.flownote.user.UserDtos.UserResponse;
import com.flownote.user.UserDtos.UserSearchResponse;

@Service
public class UserService {
    private final JdbcTemplate jdbcTemplate;
    private final BCryptPasswordEncoder passwordEncoder = new BCryptPasswordEncoder();

    public UserService(JdbcTemplate jdbcTemplate) {
        this.jdbcTemplate = jdbcTemplate;
    }

    public UserResponse register(RegisterRequest request) {
        UUID id = UUID.randomUUID();
        String passwordHash = passwordEncoder.encode(request.password());
        return jdbcTemplate.queryForObject("""
                INSERT INTO users (id, username, email, password_hash, nickname)
                VALUES (?, ?, ?, ?, ?)
                RETURNING id, username, email, nickname, role
                """,
                (rs, rowNum) -> new UserResponse(
                        rs.getObject("id", UUID.class),
                        rs.getString("username"),
                        rs.getString("email"),
                        rs.getString("nickname"),
                        rs.getString("role")),
                id,
                request.username(),
                request.email(),
                passwordHash,
                request.nickname());
    }

    public LoginResponse login(LoginRequest request) {
        UserWithPassword user = jdbcTemplate.query("""
                SELECT id, username, email, nickname, password_hash, role
                FROM users
                WHERE email = ?
                LIMIT 1
                """,
                (rs, rowNum) -> new UserWithPassword(
                        rs.getObject("id", UUID.class),
                        rs.getString("username"),
                        rs.getString("email"),
                        rs.getString("nickname"),
                        rs.getString("password_hash"),
                        rs.getString("role")),
                request.email())
                .stream()
                .findFirst()
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.UNAUTHORIZED, "이메일 또는 비밀번호가 올바르지 않습니다."));

        if (!passwordEncoder.matches(request.password(), user.passwordHash())) {
            throw new ResponseStatusException(HttpStatus.UNAUTHORIZED, "이메일 또는 비밀번호가 올바르지 않습니다.");
        }

        UUID token = UUID.randomUUID();
        jdbcTemplate.update("""
                INSERT INTO app_sessions (token, user_id, expires_at)
                VALUES (?, ?, ?)
                """, token, user.id(), OffsetDateTime.now().plusDays(30));

        return new LoginResponse(token, new UserResponse(user.id(), user.username(), user.email(), user.nickname(), user.role()));
    }

    public List<UserSearchResponse> search(UUID currentUserId, String query) {
        String normalizedQuery = query == null ? "" : query.trim().toLowerCase();
        if (normalizedQuery.length() < 2) {
            return List.of();
        }

        String likeQuery = "%" + normalizedQuery + "%";
        return jdbcTemplate.query("""
                SELECT id, username, nickname
                FROM users
                WHERE id <> ?
                  AND (
                      lower(username) LIKE ?
                      OR lower(nickname) LIKE ?
                      OR lower(email) LIKE ?
                  )
                ORDER BY nickname ASC
                LIMIT 10
                """,
                (rs, rowNum) -> new UserSearchResponse(
                        rs.getObject("id", UUID.class),
                        rs.getString("username"),
                        rs.getString("nickname")),
                currentUserId,
                likeQuery,
                likeQuery,
                likeQuery);
    }

    public UserResponse current(UUID userId) {
        return jdbcTemplate.query("""
                SELECT id, username, email, nickname, role
                FROM users
                WHERE id = ?
                """, (rs, rowNum) -> new UserResponse(
                        rs.getObject("id", UUID.class),
                        rs.getString("username"),
                        rs.getString("email"),
                        rs.getString("nickname"),
                        rs.getString("role")), userId)
                .stream()
                .findFirst()
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "사용자를 찾을 수 없습니다."));
    }

    private record UserWithPassword(UUID id, String username, String email, String nickname, String passwordHash, String role) {
    }
}
