package com.flownote.social;

import java.time.OffsetDateTime;
import java.util.List;
import java.util.UUID;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

import com.fasterxml.jackson.annotation.JsonAlias;

public final class SocialDtos {
    private SocialDtos() {
    }

    public record SocialMessageRequest(
            UUID id,
            @NotBlank @Size(max = 4000) String message,
            OffsetDateTime timestamp
    ) {
    }

    public record SocialRoomRequest(
            UUID id,
            @Size(max = 120) String name,
            @JsonAlias("participantIds")
            List<UUID> participantIds,
            @JsonAlias("participantEmails")
            List<String> participantEmails
    ) {
    }

    public record SocialRoomResponse(
            UUID id,
            String name,
            List<SocialRoomMemberResponse> members,
            String lastMessage,
            OffsetDateTime updatedAt
    ) {
    }

    public record SocialRoomMemberResponse(
            UUID id,
            String username,
            String nickname
    ) {
    }

    public record SocialMessageResponse(
            UUID id,
            UUID roomId,
            UUID userId,
            String nickname,
            String message,
            OffsetDateTime timestamp,
            boolean mine
    ) {
    }
}
