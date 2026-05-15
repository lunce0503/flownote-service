package com.flownote.notes;

import java.util.List;
import java.util.UUID;

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
import com.flownote.notes.NoteDtos.NoteRequest;
import com.flownote.notes.NoteDtos.NoteResponse;
import com.flownote.notes.NoteDtos.NoteTitleUpdateRequest;

@RestController
@RequestMapping("/api/notes")
public class NoteController {
    private final AuthService authService;
    private final NoteService noteService;

    public NoteController(AuthService authService, NoteService noteService) {
        this.authService = authService;
        this.noteService = noteService;
    }

    @GetMapping
    public List<NoteResponse> list(@RequestHeader(value = "Authorization", required = false) String authorization) {
        return noteService.list(authService.requireUserId(authorization));
    }

    @PostMapping
    public NoteResponse upsert(
            @RequestHeader(value = "Authorization", required = false) String authorization,
            @Validated @RequestBody NoteRequest request) {
        return noteService.upsert(authService.requireUserId(authorization), request);
    }

    @PatchMapping("/{noteId}")
    public NoteResponse updateTitle(
            @RequestHeader(value = "Authorization", required = false) String authorization,
            @PathVariable UUID noteId,
            @Validated @RequestBody NoteTitleUpdateRequest request) {
        return noteService.updateTitle(authService.requireUserId(authorization), noteId, request);
    }

    @DeleteMapping("/{noteId}")
    public NoteResponse delete(
            @RequestHeader(value = "Authorization", required = false) String authorization,
            @PathVariable UUID noteId) {
        return noteService.delete(authService.requireUserId(authorization), noteId);
    }
}
