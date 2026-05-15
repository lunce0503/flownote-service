package com.flownote.chat;

import java.time.OffsetDateTime;
import java.util.UUID;

import jakarta.validation.constraints.NotBlank;

public final class ChatDtos {
    private ChatDtos() {
    }

    public record ChatMessageRequest(
            UUID id,
            @NotBlank String sender,
            @NotBlank String message,
            OffsetDateTime timestamp
    ) {
    }

    public record ChatMessageResponse(
            UUID id,
            String sender,
            String message,
            OffsetDateTime timestamp
    ) {
    }
}
