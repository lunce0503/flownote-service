package com.flownote.canvas;

import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

@Component
public class CanvasDiagnosticsRetentionJob {
    private final CanvasDiagnosticsService diagnosticsService;

    public CanvasDiagnosticsRetentionJob(CanvasDiagnosticsService diagnosticsService) {
        this.diagnosticsService = diagnosticsService;
    }

    @Scheduled(cron = "0 20 3 * * *")
    public void deleteExpiredEvents() {
        diagnosticsService.deleteExpiredEvents();
    }
}
