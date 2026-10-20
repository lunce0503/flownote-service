package com.flownote.user;

import java.util.UUID;
import com.fasterxml.jackson.annotation.JsonProperty;

import jakarta.validation.constraints.Email;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

public final class UserDtos {
    private UserDtos() {
    }

    public record RegisterRequest(
            @NotBlank @Size(max = 80) String username,
            @Email @NotBlank @Size(max = 254) String email,
            @NotBlank @Size(min = 15, max = 72) String password,
            @NotBlank @Size(max = 80) String nickname
    ) {
    }

    public record LoginRequest(
            @Email @NotBlank @Size(max = 254) String email,
            @NotBlank @Size(max = 200) String password
    ) {
    }

    public record UpdateProfileRequest(
            @NotBlank @Size(max = 80) String username,
            @Email @NotBlank @Size(max = 254) String email,
            @NotBlank @Size(max = 80) String nickname,
            @JsonProperty("current_password") @Size(max = 200) String currentPassword
    ) {
        public UpdateProfileRequest(String username, String email, String nickname) {
            this(username, email, nickname, null);
        }
    }

    public record UserResponse(UUID id, String username, String email, String nickname, String role) {
    }

    public record UserSearchResponse(UUID id, String username, String nickname) {
    }

    public record LoginResponse(UUID token, UserResponse user) {
    }
}
