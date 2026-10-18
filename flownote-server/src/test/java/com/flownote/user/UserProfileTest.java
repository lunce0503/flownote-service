package com.flownote.user;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.patch;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.flownote.api.ApiExceptionHandler;
import com.flownote.auth.AuthService;
import com.flownote.user.UserDtos.UpdateProfileRequest;
import com.flownote.user.UserDtos.UserResponse;
import java.util.List;
import java.util.UUID;
import org.junit.jupiter.api.Test;
import org.springframework.dao.DuplicateKeyException;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.core.RowMapper;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;
import org.springframework.web.server.ResponseStatusException;

class UserProfileTest {
    private final AuthService auth = mock(AuthService.class);
    private final UserService service = mock(UserService.class);

    @Test
    void requiresAuthenticationAndNeverAcceptsAnotherUserId() throws Exception {
        when(auth.requireUserId(null)).thenThrow(new ResponseStatusException(HttpStatus.UNAUTHORIZED));
        mvc().perform(patch("/api/users/me").contentType("application/json")
                .content("{\"username\":\"new-name\",\"nickname\":\"새 이름\",\"email\":\"new@example.com\"}"))
                .andExpect(status().isUnauthorized());
        verifyNoInteractions(service);
        UUID userId = UUID.randomUUID();
        when(auth.requireUserId("Bearer session")).thenReturn(userId);
        when(service.updateProfile(eq(userId), any())).thenReturn(new UserResponse(userId, "new-name", "new@example.com", "새 이름", "USER"));
        mvc().perform(patch("/api/users/me").header("Authorization", "Bearer session")
                .contentType("application/json")
                .content("{\"id\":\"" + UUID.randomUUID() + "\",\"role\":\"ADMIN\",\"username\":\"new-name\",\"nickname\":\"새 이름\",\"email\":\"new@example.com\"}"))
                .andExpect(status().isOk());
        verify(service).updateProfile(eq(userId), any());
    }

    @Test
    void rejectsBlankFieldsAndInvalidEmail() throws Exception {
        mvc().perform(patch("/api/users/me").contentType("application/json")
                .content("{\"username\":\" \u0020\",\"nickname\":\"\",\"email\":\"invalid\"}"))
                .andExpect(status().isBadRequest());
        verifyNoInteractions(service);
    }

    @SuppressWarnings("unchecked")
    @Test
    void updatesOnlyTheAuthenticatedUserAndTrimsNames() {
        JdbcTemplate jdbc = mock(JdbcTemplate.class);
        UUID id = UUID.randomUUID();
        when(jdbc.update(anyString(), any(), any(), any(), any())).thenReturn(1);
        when(jdbc.query(anyString(), any(RowMapper.class), eq(id)))
                .thenReturn(List.of(new UserResponse(id, "username", "new@example.com", "nickname", "USER")));
        UserResponse updated = new UserService(jdbc).updateProfile(id, new UpdateProfileRequest(" username ", "new@example.com", " nickname "));
        assertThat(updated.nickname()).isEqualTo("nickname");
        verify(jdbc).update(contains("WHERE id = ?"), eq("username"), eq("new@example.com"), eq("nickname"), eq(id));
    }

    @Test
    void duplicateEmailReturnsConflict() throws Exception {
        when(auth.requireUserId(anyString())).thenReturn(UUID.randomUUID());
        when(service.updateProfile(any(), any())).thenThrow(new DuplicateKeyException("duplicate"));
        mvc().perform(patch("/api/users/me").header("Authorization", "Bearer session")
                .contentType("application/json")
                .content("{\"username\":\"user\",\"nickname\":\"name\",\"email\":\"taken@example.com\"}"))
                .andExpect(status().isConflict());
    }

    @SuppressWarnings("unchecked")
    @Test
    void emailChangeRequiresTheCurrentPassword() {
        JdbcTemplate jdbc = mock(JdbcTemplate.class);
        UUID id = UUID.randomUUID();
        when(jdbc.query(anyString(), any(RowMapper.class), eq(id)))
                .thenReturn(List.of(new UserResponse(id, "user", "old@example.com", "name", "USER")));
        when(jdbc.queryForObject(anyString(), eq(String.class), eq(id))).thenReturn("hash");
        org.assertj.core.api.Assertions.assertThatThrownBy(() -> new UserService(jdbc)
                .updateProfile(id, new UpdateProfileRequest("user", "new@example.com", "name")))
                .isInstanceOfSatisfying(ResponseStatusException.class,
                        error -> assertThat(error.getStatusCode()).isEqualTo(HttpStatus.FORBIDDEN));
        verify(jdbc, never()).update(anyString(), any(), any(), any(), any());
    }

    private org.springframework.test.web.servlet.MockMvc mvc() {
        return MockMvcBuilders.standaloneSetup(new UserController(auth, service))
                .setControllerAdvice(new ApiExceptionHandler()).build();
    }
}
