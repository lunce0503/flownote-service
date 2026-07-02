package com.flownote.canvas;

import java.time.OffsetDateTime;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;

import org.springframework.http.ResponseEntity;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import com.flownote.auth.AuthService;

@RestController
@RequestMapping("/api/admin/canvas")
public class CanvasAdminController {
    private final AuthService authService;
    private final JdbcTemplate jdbcTemplate;
    private final CanvasDiagnosticsService diagnosticsService;
    private final CanvasOperationScheduler operationScheduler;
    private final CanvasStorageOutboxWorker storageWorker;
    private final CanvasAssetStorage assetStorage;

    public CanvasAdminController(AuthService authService, JdbcTemplate jdbcTemplate,
            CanvasDiagnosticsService diagnosticsService, CanvasOperationScheduler operationScheduler,
            CanvasStorageOutboxWorker storageWorker, CanvasAssetStorage assetStorage) {
        this.authService = authService;
        this.jdbcTemplate = jdbcTemplate;
        this.diagnosticsService = diagnosticsService;
        this.operationScheduler = operationScheduler;
        this.storageWorker = storageWorker;
        this.assetStorage = assetStorage;
    }

    @GetMapping("/summary")
    public Map<String, Object> summary(
            @RequestHeader(value = "Authorization", required = false) String authorization) {
        authService.requireAdmin(authorization);
        Integer databaseProbe = jdbcTemplate.queryForObject("SELECT 1", Integer.class);
        Map<String, Object> response = new LinkedHashMap<>();
        response.put("database", databaseProbe != null && databaseProbe == 1 ? "UP" : "DOWN");
        response.put("requestQueue", operationScheduler.stats());
        response.put("storageJobs", diagnosticsService.storageJobSummary());
        response.put("retentionDays", 30);
        response.put("checkedAt", OffsetDateTime.now());
        return response;
    }

    @GetMapping("/events")
    public List<Map<String, Object>> events(
            @RequestHeader(value = "Authorization", required = false) String authorization,
            @RequestParam(defaultValue = "100") int limit) {
        authService.requireAdmin(authorization);
        return diagnosticsService.recentEvents(limit);
    }

    @PostMapping("/storage-jobs/{jobId}/retry")
    public ResponseEntity<Void> retryStorageJob(
            @RequestHeader(value = "Authorization", required = false) String authorization,
            @PathVariable UUID jobId) {
        authService.requireAdmin(authorization);
        storageWorker.retry(jobId);
        return ResponseEntity.accepted().build();
    }

    @PostMapping("/storage-probe")
    public Map<String, Object> storageProbe(
            @RequestHeader(value = "Authorization", required = false) String authorization) {
        authService.requireAdmin(authorization);
        long startedAt = System.nanoTime();
        assetStorage.verifyReadWrite();
        return Map.of("status", "UP", "elapsedMs", (System.nanoTime() - startedAt) / 1_000_000);
    }
}
