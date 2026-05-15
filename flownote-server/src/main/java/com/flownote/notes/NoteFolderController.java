package com.flownote.notes;

import java.net.URI;
import java.util.List;
import java.util.UUID;

import org.springframework.http.ResponseEntity;
import org.springframework.validation.annotation.Validated;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import com.flownote.auth.AuthService;
import com.flownote.notes.NoteFolderDtos.NoteFolderRequest;
import com.flownote.notes.NoteFolderDtos.NoteFolderResponse;
import com.flownote.notes.NoteFolderDtos.NoteFolderUpdateRequest;

@RestController
@RequestMapping("/api/note-folders")
public class NoteFolderController {
    private final AuthService authService;
    private final NoteFolderService noteFolderService;

    public NoteFolderController(AuthService authService, NoteFolderService noteFolderService) {
        this.authService = authService;
        this.noteFolderService = noteFolderService;
    }

    @GetMapping
    public List<NoteFolderResponse> list(@RequestHeader(value = "Authorization", required = false) String authorization) {
        return noteFolderService.list(authService.requireUserId(authorization));
    }

    @PostMapping
    public ResponseEntity<NoteFolderResponse> create(
            @RequestHeader(value = "Authorization", required = false) String authorization,
            @Validated @RequestBody NoteFolderRequest request) {
        NoteFolderResponse created = noteFolderService.create(authService.requireUserId(authorization), request);
        return ResponseEntity.created(URI.create("/api/note-folders/" + created.id())).body(created);
    }

    @PatchMapping("/{folderId}")
    public NoteFolderResponse update(
            @RequestHeader(value = "Authorization", required = false) String authorization,
            @PathVariable UUID folderId,
            @RequestBody NoteFolderUpdateRequest request) {
        return noteFolderService.update(authService.requireUserId(authorization), folderId, request);
    }

    @DeleteMapping("/{folderId}")
    public ResponseEntity<Void> delete(
            @RequestHeader(value = "Authorization", required = false) String authorization,
            @PathVariable UUID folderId) {
        noteFolderService.delete(authService.requireUserId(authorization), folderId);
        return ResponseEntity.noContent().build();
    }

    @PostMapping("/{folderId}/notes/{noteId}")
    public NoteFolderResponse addNote(
            @RequestHeader(value = "Authorization", required = false) String authorization,
            @PathVariable UUID folderId,
            @PathVariable UUID noteId) {
        return noteFolderService.addNote(authService.requireUserId(authorization), folderId, noteId);
    }

    @DeleteMapping("/{folderId}/notes/{noteId}")
    public NoteFolderResponse removeNote(
            @RequestHeader(value = "Authorization", required = false) String authorization,
            @PathVariable UUID folderId,
            @PathVariable UUID noteId) {
        return noteFolderService.removeNote(authService.requireUserId(authorization), folderId, noteId);
    }
}
