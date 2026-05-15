package com.flownote.server.task;

import com.fasterxml.jackson.databind.JsonNode;
import jakarta.validation.Valid;
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

import com.flownote.auth.AuthService;

@RestController
@RequestMapping("/api/tasks")
public class TaskController {
    private final AuthService authService;
    private final TaskService taskService;

    public TaskController(AuthService authService, TaskService taskService) {
        this.authService = authService;
        this.taskService = taskService;
    }

    @GetMapping
    public List<Task> findAll(@RequestHeader(value = "Authorization", required = false) String authorization) {
        UUID userId = authService.requireUserId(authorization);
        return taskService.findAll(userId);
    }

    @PostMapping
    public ResponseEntity<Task> create(
            @RequestHeader(value = "Authorization", required = false) String authorization,
            @Valid @RequestBody CreateTaskRequest request) {
        UUID userId = authService.requireUserId(authorization);
        Task created = taskService.create(userId, request);
        return ResponseEntity.created(URI.create("/api/tasks/" + created.id())).body(created);
    }

    @PatchMapping("/{id}")
    public ResponseEntity<?> update(
            @RequestHeader(value = "Authorization", required = false) String authorization,
            @PathVariable String id,
            @RequestBody JsonNode body) {
        UUID userId = authService.requireUserId(authorization);
        return taskService.update(userId, id, body)
                .<ResponseEntity<?>>map(task -> ResponseEntity.ok(Map.of(
                        "message", "성공적으로 업데이트되었습니다.",
                        "updatedTask", task
                )))
                .orElseGet(() -> ResponseEntity.notFound().build());
    }

    @DeleteMapping("/{id}")
    public ResponseEntity<?> delete(
            @RequestHeader(value = "Authorization", required = false) String authorization,
            @PathVariable String id) {
        UUID userId = authService.requireUserId(authorization);
        return taskService.delete(userId, id)
                .<ResponseEntity<?>>map(task -> ResponseEntity.ok(Map.of(
                        "message", "성공적으로 삭제되었습니다.",
                        "deletedTask", task
                )))
                .orElseGet(() -> ResponseEntity.notFound().build());
    }
}
