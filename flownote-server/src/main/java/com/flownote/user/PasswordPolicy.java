package com.flownote.user;

import java.nio.charset.StandardCharsets;
import java.util.Locale;
import java.util.Set;
import org.springframework.http.HttpStatus;
import org.springframework.web.server.ResponseStatusException;

final class PasswordPolicy {
    private static final Set<String> COMMON = Set.of(
            "123456789012345", "1234567890123456", "passwordpassword", "password123456789",
            "qwertyuiopasdfgh", "letmeinletmeinletmein", "iloveyouiloveyou", "changemechangeme");

    static void validate(String password) {
        if (password == null || password.isBlank() || password.codePointCount(0, password.length()) < 15
                || password.getBytes(StandardCharsets.UTF_8).length > 72
                || password.codePoints().distinct().count() < 4
                || COMMON.contains(password.toLowerCase(Locale.ROOT))) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST,
                    "비밀번호는 15자 이상, UTF-8 72바이트 이하이며 흔한 비밀번호는 사용할 수 없습니다.");
        }
    }

    private PasswordPolicy() {}
}
