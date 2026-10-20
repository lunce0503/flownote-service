package com.flownote.user;

import static org.assertj.core.api.Assertions.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import java.util.List;
import com.flownote.api.ApiExceptionHandler;
import com.flownote.auth.AuthService;
import org.junit.jupiter.api.Test;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.data.redis.core.script.RedisScript;
import org.springframework.http.HttpStatus;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;
import org.springframework.web.server.ResponseStatusException;

class AuthSecurityTest {
    @Test
    void validatesPasswordCharactersAndUtf8BytesWithoutTruncation() {
        for (String password : new String[]{"", "               ", "short-password", "passwordpassword", "가나다라마바사아자차카타파하한글긴문자열입니다추가", "a".repeat(72)}) {
            assertThatThrownBy(() -> PasswordPolicy.validate(password)).isInstanceOf(ResponseStatusException.class);
        }
        assertThatThrownBy(() -> PasswordPolicy.validate(null)).isInstanceOf(ResponseStatusException.class);
        assertThatCode(() -> PasswordPolicy.validate("a good long passphrase 123")).doesNotThrowAnyException();
        assertThatCode(() -> PasswordPolicy.validate("다양한 한글 암호문구 12345")).doesNotThrowAnyException();
        assertThatCode(() -> PasswordPolicy.validate("abcd".repeat(18))).doesNotThrowAnyException();
        assertThatThrownBy(() -> PasswordPolicy.validate("abcd".repeat(18) + "e")).isInstanceOf(ResponseStatusException.class);
    }

    @Test
    void missingOrBlankPasswordsNeverReachRegistration() throws Exception {
        UserService users = mock(UserService.class);
        var mvc = MockMvcBuilders.standaloneSetup(new UserController(mock(AuthService.class), users))
                .setControllerAdvice(new ApiExceptionHandler()).build();
        for (String password : List.of("null", "\"\"", "\"               \"", "\"short\"")) {
            mvc.perform(post("/api/users").contentType("application/json")
                    .content("{\"username\":\"test\",\"nickname\":\"Test\",\"email\":\"test@example.com\",\"password\":" + password + "}"))
                    .andExpect(status().isBadRequest());
        }
        verifyNoInteractions(users);
    }

    @SuppressWarnings("unchecked")
    @Test
    void sharedLoginLimitBlocksExcessAndFailsClosedOnRedisFailure() {
        StringRedisTemplate redis = mock(StringRedisTemplate.class);
        when(redis.execute(any(RedisScript.class), anyList(), any(Object[].class))).thenReturn(11L);
        LoginThrottle throttle = new LoginThrottle(redis);
        assertThatThrownBy(() -> throttle.check("test@example.com", "peer"))
                .isInstanceOfSatisfying(ResponseStatusException.class,
                        error -> assertThat(error.getStatusCode()).isEqualTo(HttpStatus.TOO_MANY_REQUESTS));
        when(redis.execute(any(RedisScript.class), anyList(), any(Object[].class))).thenThrow(new IllegalStateException());
        assertThatThrownBy(() -> throttle.check("test@example.com", "peer"))
                .isInstanceOfSatisfying(ResponseStatusException.class,
                        error -> assertThat(error.getStatusCode()).isEqualTo(HttpStatus.SERVICE_UNAVAILABLE));
    }
}
