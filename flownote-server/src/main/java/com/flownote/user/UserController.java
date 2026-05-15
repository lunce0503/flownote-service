package com.flownote.user;

import org.springframework.validation.annotation.Validated;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;

import com.flownote.auth.AuthService;
import com.flownote.user.UserDtos.LoginRequest;
import com.flownote.user.UserDtos.LoginResponse;
import com.flownote.user.UserDtos.RegisterRequest;
import com.flownote.user.UserDtos.UserResponse;
import com.flownote.user.UserDtos.UserSearchResponse;

@RestController
@RequestMapping("/api/users")
public class UserController {
    private final AuthService authService;
    private final UserService userService;

    public UserController(AuthService authService, UserService userService) {
        this.authService = authService;
        this.userService = userService;
    }

    @PostMapping
    public UserResponse register(@Validated @RequestBody RegisterRequest request) {
        return userService.register(request);
    }

    @PostMapping("/login")
    public LoginResponse login(@Validated @RequestBody LoginRequest request) {
        return userService.login(request);
    }

    @GetMapping("/search")
    public List<UserSearchResponse> search(
            @RequestHeader(value = "Authorization", required = false) String authorization,
            @RequestParam(defaultValue = "") String q) {
        return userService.search(authService.requireUserId(authorization), q);
    }

    @GetMapping
    public void listUsersBlocked() {
        throw new org.springframework.web.server.ResponseStatusException(
                org.springframework.http.HttpStatus.FORBIDDEN,
                "사용자 목록 조회는 허용되지 않습니다.");
    }
}
