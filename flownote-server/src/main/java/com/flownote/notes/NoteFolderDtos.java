package com.flownote.notes;

import java.time.OffsetDateTime;
import java.util.List;
import java.util.UUID;

import jakarta.validation.constraints.NotBlank;

public final class NoteFolderDtos {
    private NoteFolderDtos() {
    }

    public record NoteFolderRequest(
            String category,
            @NotBlank String name,
            List<UUID> noteIds
    ) {
    }

    public record NoteFolderUpdateRequest(
            String category,
            String name,
            List<UUID> noteIds
    ) {
    }

    public record NoteFolderResponse(
            UUID id,
            String category,
            String name,
            List<UUID> noteIds,
            OffsetDateTime createdAt,
            OffsetDateTime updatedAt
    ) {
    }
}
