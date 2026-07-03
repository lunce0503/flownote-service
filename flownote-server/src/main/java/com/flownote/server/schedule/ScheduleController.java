package com.flownote.server.schedule;

import com.fasterxml.jackson.databind.JsonNode;
import com.flownote.auth.AuthService;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.net.URI;
import java.util.List;
import java.util.Map;
import java.util.UUID;

@RestController
@RequestMapping("/api/schedule-items")
public class ScheduleController {
    private final AuthService authService;
    private final ScheduleService scheduleService;

    public ScheduleController(AuthService authService, ScheduleService scheduleService) {
        this.authService = authService;
        this.scheduleService = scheduleService;
    }

    @GetMapping
    public List<ScheduleItem> findAll(@RequestHeader(value = "Authorization", required = false) String authorization) {
        UUID userId = authService.requireUserId(authorization);
        return scheduleService.findAll(userId);
    }

    @PostMapping
    public ResponseEntity<ScheduleItem> create(
            @RequestHeader(value = "Authorization", required = false) String authorization,
            @RequestBody ScheduleItemRequest request) {
        UUID userId = authService.requireUserId(authorization);
        ScheduleItem created = scheduleService.create(userId, request);
        return ResponseEntity.created(URI.create("/api/schedule-items/" + created.id())).body(created);
    }

    @PatchMapping("/{id}")
    public ResponseEntity<?> update(
            @RequestHeader(value = "Authorization", required = false) String authorization,
            @PathVariable String id,
            @RequestBody JsonNode body) {
        UUID userId = authService.requireUserId(authorization);
        return scheduleService.update(userId, id, body)
                .<ResponseEntity<?>>map(item -> ResponseEntity.ok(Map.of(
                        "message", "시간표가 수정되었습니다.",
                        "updatedScheduleItem", item
                )))
                .orElseGet(() -> ResponseEntity.notFound().build());
    }

    @DeleteMapping("/{id}")
    public ResponseEntity<?> delete(
            @RequestHeader(value = "Authorization", required = false) String authorization,
            @PathVariable String id) {
        UUID userId = authService.requireUserId(authorization);
        return scheduleService.delete(userId, id)
                .<ResponseEntity<?>>map(item -> ResponseEntity.ok(Map.of(
                        "message", "시간표가 삭제되었습니다.",
                        "deletedScheduleItem", item
                )))
                .orElseGet(() -> ResponseEntity.notFound().build());
    }
}
