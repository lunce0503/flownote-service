package com.flownote.user;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.util.HexFormat;
import java.util.List;
import java.util.Locale;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.data.redis.core.script.DefaultRedisScript;
import org.springframework.http.HttpStatus;
import org.springframework.http.HttpHeaders;
import org.springframework.stereotype.Service;
import org.springframework.web.server.ResponseStatusException;

@Service
public class LoginThrottle {
    private static final DefaultRedisScript<Long> ATTEMPT = new DefaultRedisScript<>("""
            local count = redis.call('INCR', KEYS[1])
            if count == 1 then redis.call('EXPIRE', KEYS[1], ARGV[1]) end
            return count
            """, Long.class);
    private final StringRedisTemplate redis;

    public LoginThrottle(StringRedisTemplate redis) { this.redis = redis; }

    public void check(String email, String remoteAddress) {
        checkBucket("account", email.trim().toLowerCase(Locale.ROOT), 60, 10);
        // Only the servlet peer is trusted; client-supplied forwarding headers are ignored.
        checkBucket("peer", remoteAddress == null ? "unknown" : remoteAddress, 60, 60);
        checkBucket("account-hour", email.trim().toLowerCase(Locale.ROOT), 3600, 100);
    }

    private void checkBucket(String kind, String value, int seconds, int limit) {
        Long count;
        try {
            count = redis.execute(ATTEMPT, List.of("login-attempt:" + kind + ":" + hash(value)), String.valueOf(seconds));
        } catch (RuntimeException error) {
            throw new ResponseStatusException(HttpStatus.SERVICE_UNAVAILABLE, "로그인 서비스를 잠시 후 다시 이용해 주세요.");
        }
        if (count == null) throw new ResponseStatusException(HttpStatus.SERVICE_UNAVAILABLE, "로그인을 확인할 수 없습니다.");
        if (count > limit) {
            throw new LimitExceeded(seconds);
        }
    }

    private static final class LimitExceeded extends ResponseStatusException {
        private final int retryAfter;
        LimitExceeded(int retryAfter) {
            super(HttpStatus.TOO_MANY_REQUESTS, "로그인 시도가 많습니다. 잠시 후 다시 시도해 주세요.");
            this.retryAfter = retryAfter;
        }
        @Override
        public HttpHeaders getHeaders() {
            HttpHeaders headers = new HttpHeaders();
            headers.set("Retry-After", String.valueOf(retryAfter));
            return headers;
        }
    }

    private static String hash(String value) {
        try {
            return HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(value.getBytes(StandardCharsets.UTF_8)));
        } catch (NoSuchAlgorithmException error) { throw new IllegalStateException(error); }
    }
}
