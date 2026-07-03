package com.flownote.notes;

import java.time.OffsetDateTime;
import java.util.UUID;

import com.fasterxml.jackson.databind.JsonNode;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Positive;

public final class NoteDtos {
    private NoteDtos() {
    }

    public record NoteRequest(
            @NotNull UUID id,
            @NotBlank String title,
            @NotNull JsonNode content,
            OffsetDateTime createdAt,
            @Positive long revision,
            @NotBlank String clientId
    ) {
    }

    public record NoteResponse(
            UUID id,
            String title,
            JsonNode content,
            OffsetDateTime createdAt,
            OffsetDateTime updatedAt,
            long revision,
            String clientId
    ) {
    }

    public record NoteTitleUpdateRequest(
            @NotBlank String title,
            @Positive long revision,
            @NotBlank String clientId
    ) {
    }
}
