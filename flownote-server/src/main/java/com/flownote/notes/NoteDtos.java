package com.flownote.notes;

import java.time.OffsetDateTime;
import java.util.UUID;

import com.fasterxml.jackson.databind.JsonNode;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;

public final class NoteDtos {
    private NoteDtos() {
    }

    public record NoteRequest(
            @NotNull UUID id,
            @NotBlank String title,
            @NotNull JsonNode content,
            OffsetDateTime createdAt
    ) {
    }

    public record NoteResponse(
            UUID id,
            String title,
            JsonNode content,
            OffsetDateTime createdAt,
            OffsetDateTime updatedAt
    ) {
    }

    public record NoteTitleUpdateRequest(
            @NotBlank String title
    ) {
    }
}
