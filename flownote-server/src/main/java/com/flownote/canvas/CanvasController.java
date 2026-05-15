package com.flownote.canvas;

import java.util.UUID;

import org.springframework.validation.annotation.Validated;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import com.flownote.auth.AuthService;
import com.flownote.canvas.CanvasDtos.CanvasResponse;
import com.flownote.canvas.CanvasDtos.CanvasSaveRequest;

@RestController
@RequestMapping("/api/canvas")
public class CanvasController {
    private final AuthService authService;
    private final CanvasService canvasService;

    public CanvasController(AuthService authService, CanvasService canvasService) {
        this.authService = authService;
        this.canvasService = canvasService;
    }

    @GetMapping({"/load", ""})
    public CanvasResponse load(@RequestHeader(value = "Authorization", required = false) String authorization) {
        UUID userId = authService.requireUserId(authorization);
        return canvasService.load(userId);
    }

    @PostMapping("/save")
    public CanvasResponse save(
            @RequestHeader(value = "Authorization", required = false) String authorization,
            @Validated @RequestBody CanvasSaveRequest request) {
        UUID userId = authService.requireUserId(authorization);
        return canvasService.save(userId, request);
    }
}
