package com.flownote.user;

import java.util.UUID;

import jakarta.validation.constraints.Email;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

public final class UserDtos {
    private UserDtos() {
    }

    public record RegisterRequest(
            @NotBlank String username,
            @Email @NotBlank String email,
            @Size(min = 6) String password,
            @NotBlank String nickname
    ) {
    }

    public record LoginRequest(
            @Email @NotBlank String email,
            @NotBlank String password
    ) {
    }

    public record UserResponse(UUID id, String username, String email, String nickname) {
    }

    public record UserSearchResponse(UUID id, String username, String nickname) {
    }

    public record LoginResponse(UUID token, UserResponse user) {
    }
}
