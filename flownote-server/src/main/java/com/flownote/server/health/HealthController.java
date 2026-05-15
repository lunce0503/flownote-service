package com.flownote.server.health;

import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.time.Instant;
import java.util.Map;

@RestController
@RequestMapping("/api/health")
public class HealthController {
    @GetMapping
    public Map<String, Object> health() {
        return Map.of(
                "status", "ok",
                "service", "flownote-server",
                "timestamp", Instant.now()
        );
    }
}
