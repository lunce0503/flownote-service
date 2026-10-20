package com.flownote.auth;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;

import java.util.List;
import java.util.UUID;

import org.junit.jupiter.api.Test;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.data.redis.core.ValueOperations;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.core.RowMapper;
import org.springframework.web.server.ResponseStatusException;

class AuthServiceTest {
    @Test
    void rejectsMalformedBearerTokenBeforeAccessingStores() {
        AuthService service = new AuthService(mock(JdbcTemplate.class), mock(StringRedisTemplate.class));

        assertThatThrownBy(() -> service.requireUser("Bearer invalid"))
                .isInstanceOfSatisfying(ResponseStatusException.class,
                        error -> assertThat(error.getStatusCode()).isEqualTo(HttpStatus.UNAUTHORIZED));
    }

    @SuppressWarnings("unchecked")
    @Test
    void alwaysChecksDatabaseEvenWhenRedisContainsAnOldSession() {
        JdbcTemplate jdbc = mock(JdbcTemplate.class);
        StringRedisTemplate redis = mock(StringRedisTemplate.class);
        ValueOperations<String, String> values = mock(ValueOperations.class);
        UUID token = UUID.randomUUID();
        UUID userId = UUID.randomUUID();

        when(redis.opsForValue()).thenReturn(values);
        when(values.get(anyString())).thenReturn(userId + "|ADMIN");
        when(jdbc.query(anyString(), any(RowMapper.class), any(), any()))
                .thenReturn(List.of(new AuthService.AuthenticatedUser(userId, "USER")));

        assertThat(service(jdbc, redis).requireUser("Bearer " + token).role()).isEqualTo("USER");
        verifyNoInteractions(redis);
    }

    @SuppressWarnings("unchecked")
    @Test
    void requiresAdminRole() {
        JdbcTemplate jdbc = mock(JdbcTemplate.class);
        StringRedisTemplate redis = mock(StringRedisTemplate.class);
        ValueOperations<String, String> values = mock(ValueOperations.class);

        when(redis.opsForValue()).thenReturn(values);
        when(values.get(anyString())).thenReturn(null);
        when(jdbc.query(anyString(), any(RowMapper.class), any(), any()))
                .thenReturn(List.of(new AuthService.AuthenticatedUser(UUID.randomUUID(), "USER")));

        assertThatThrownBy(() -> service(jdbc, redis).requireAdmin("Bearer " + UUID.randomUUID()))
                .isInstanceOfSatisfying(ResponseStatusException.class,
                        error -> assertThat(error.getStatusCode()).isEqualTo(HttpStatus.FORBIDDEN));
    }

    private AuthService service(JdbcTemplate jdbc, StringRedisTemplate redis) {
        return new AuthService(jdbc, redis);
    }

    @SuppressWarnings("unchecked")
    @Test
    void deletedOrExpiredSessionCannotUseStaleCache() {
        JdbcTemplate jdbc = mock(JdbcTemplate.class);
        StringRedisTemplate redis = mock(StringRedisTemplate.class);
        when(jdbc.query(anyString(), any(RowMapper.class), any(), any())).thenReturn(List.of());
        assertThatThrownBy(() -> service(jdbc, redis).requireUser("Bearer " + UUID.randomUUID()))
                .isInstanceOfSatisfying(ResponseStatusException.class,
                        error -> assertThat(error.getStatusCode()).isEqualTo(HttpStatus.UNAUTHORIZED));
        verifyNoInteractions(redis);
    }

    @Test
    void logoutDeletesDatabaseSessionEvenWhenCacheDeletionFails() {
        JdbcTemplate jdbc = mock(JdbcTemplate.class);
        StringRedisTemplate redis = mock(StringRedisTemplate.class);
        UUID token = UUID.randomUUID();
        when(redis.delete("session:" + token)).thenThrow(new IllegalStateException("redis unavailable"));
        service(jdbc, redis).logout("Bearer " + token);
        verify(jdbc).update("DELETE FROM app_sessions WHERE token = ?", token);
    }
}
