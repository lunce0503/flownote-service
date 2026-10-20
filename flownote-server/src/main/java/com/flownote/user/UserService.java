package com.flownote.user;

import java.time.OffsetDateTime;
import java.util.List;
import java.util.UUID;

import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.web.server.ResponseStatusException;

import com.flownote.user.UserDtos.LoginRequest;
import com.flownote.user.UserDtos.LoginResponse;
import com.flownote.user.UserDtos.RegisterRequest;
import com.flownote.user.UserDtos.UserResponse;
import com.flownote.user.UserDtos.UserSearchResponse;
import com.flownote.user.UserDtos.UpdateProfileRequest;

@Service
public class UserService {
    private final JdbcTemplate jdbcTemplate;
    private final BCryptPasswordEncoder passwordEncoder = new BCryptPasswordEncoder();
    private final LoginThrottle loginThrottle;
    private final String dummyHash = passwordEncoder.encode(UUID.randomUUID().toString());

    public UserService(JdbcTemplate jdbcTemplate) {
        this(jdbcTemplate, null);
    }

    @Autowired
    public UserService(JdbcTemplate jdbcTemplate, LoginThrottle loginThrottle) {
        this.jdbcTemplate = jdbcTemplate;
        this.loginThrottle = loginThrottle;
    }

    public UserResponse register(RegisterRequest request) {
        PasswordPolicy.validate(request.password());
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

    public LoginResponse login(LoginRequest request, String remoteAddress) {
        if (loginThrottle != null) loginThrottle.check(request.email(), remoteAddress);
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
                .orElse(null);

        String hash = user == null || user.passwordHash() == null || user.passwordHash().isBlank() ? dummyHash : user.passwordHash();
        boolean matches = request.password().getBytes(java.nio.charset.StandardCharsets.UTF_8).length <= 72
                && passwordEncoder.matches(request.password(), hash);
        if (user == null || !matches) {
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

    public UserResponse updateProfile(UUID userId, UpdateProfileRequest request) {
        UserResponse existing = current(userId);
        String email = request.email().trim();
        if (!email.equals(existing.email())) {
            String hash = jdbcTemplate.queryForObject("SELECT password_hash FROM users WHERE id = ?", String.class, userId);
            if (request.currentPassword() == null || hash == null || !passwordEncoder.matches(request.currentPassword(), hash)) {
                throw new ResponseStatusException(HttpStatus.FORBIDDEN, "이메일 변경에는 현재 비밀번호 확인이 필요합니다.");
            }
        }
        int updated = jdbcTemplate.update("""
                UPDATE users SET username = ?, email = ?, nickname = ? WHERE id = ?
                """, request.username().trim(), email, request.nickname().trim(), userId);
        if (updated == 0) {
            throw new ResponseStatusException(HttpStatus.NOT_FOUND, "사용자를 찾을 수 없습니다.");
        }
        return current(userId);
    }
}
