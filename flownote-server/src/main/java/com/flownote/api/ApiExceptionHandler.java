package com.flownote.api;

import java.util.Map;
import java.util.UUID;

import org.springframework.dao.DataAccessException;
import org.springframework.dao.DuplicateKeyException;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.MethodArgumentNotValidException;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;
import org.springframework.web.multipart.MaxUploadSizeExceededException;
import org.springframework.web.server.ResponseStatusException;

@RestControllerAdvice
public class ApiExceptionHandler {
    @ExceptionHandler(ResponseStatusException.class)
    ResponseEntity<Map<String, Object>> handleResponseStatus(ResponseStatusException exception) {
        int status = exception.getStatusCode().value();
        return ResponseEntity.status(exception.getStatusCode())
                .body(errorBody(
                        status == 429 ? "CANVAS_QUEUE_FULL" : status == 503 ? "CANVAS_TEMPORARILY_UNAVAILABLE" : "REQUEST_FAILED",
                        exception.getReason() == null ? "요청을 처리하지 못했습니다." : exception.getReason(),
                        status == 429 || status >= 500,
                        status == 429 ? 1500L : status >= 500 ? 3000L : 0L));
    }

    @ExceptionHandler(MethodArgumentNotValidException.class)
    ResponseEntity<Map<String, String>> handleValidation(MethodArgumentNotValidException exception) {
        return ResponseEntity.badRequest().body(Map.of("error", "요청 값이 올바르지 않습니다."));
    }

    @ExceptionHandler(DuplicateKeyException.class)
    ResponseEntity<Map<String, String>> handleDuplicate(DuplicateKeyException exception) {
        return ResponseEntity.status(HttpStatus.CONFLICT).body(Map.of("error", "이미 존재하는 데이터입니다."));
    }

    @ExceptionHandler(MaxUploadSizeExceededException.class)
    ResponseEntity<Map<String, String>> handleMaxUploadSize(MaxUploadSizeExceededException exception) {
        return ResponseEntity.status(HttpStatus.PAYLOAD_TOO_LARGE)
                .body(Map.of("error", "업로드 가능한 파일 크기를 초과했습니다."));
    }

    @ExceptionHandler(DataAccessException.class)
    ResponseEntity<Map<String, Object>> handleDatabaseFailure(DataAccessException exception) {
        return ResponseEntity.status(HttpStatus.SERVICE_UNAVAILABLE)
                .body(errorBody("DATABASE_UNAVAILABLE", "데이터베이스 연결이 불안정합니다. 로컬에 보관한 뒤 다시 시도합니다.", true, 3000L));
    }

    private Map<String, Object> errorBody(String code, String message, boolean retryable, long retryAfterMs) {
        return Map.of(
                "code", code,
                "error", message,
                "retryable", retryable,
                "retryAfterMs", retryAfterMs,
                "requestId", UUID.randomUUID().toString());
    }
}
