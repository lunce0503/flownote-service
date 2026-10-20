package com.flownote.user;

import org.springframework.validation.annotation.Validated;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;
import jakarta.servlet.http.HttpServletRequest;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.ResponseStatus;

import com.flownote.auth.AuthService;
import com.flownote.user.UserDtos.LoginRequest;
import com.flownote.user.UserDtos.LoginResponse;
import com.flownote.user.UserDtos.RegisterRequest;
import com.flownote.user.UserDtos.UserResponse;
import com.flownote.user.UserDtos.UserSearchResponse;
import com.flownote.user.UserDtos.UpdateProfileRequest;

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
    public LoginResponse login(@Validated @RequestBody LoginRequest request, HttpServletRequest httpRequest) {
        return userService.login(request, httpRequest.getRemoteAddr());
    }

    @PostMapping("/logout")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void logout(@RequestHeader(value = "Authorization", required = false) String authorization) {
        authService.logout(authorization);
    }

    @PostMapping("/logout-all")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void logoutAll(@RequestHeader(value = "Authorization", required = false) String authorization) {
        authService.logoutAll(authorization);
    }

    @GetMapping("/search")
    public List<UserSearchResponse> search(
            @RequestHeader(value = "Authorization", required = false) String authorization,
            @RequestParam(defaultValue = "") String q) {
        return userService.search(authService.requireUserId(authorization), q);
    }

    @GetMapping("/me")
    public UserResponse current(
            @RequestHeader(value = "Authorization", required = false) String authorization) {
        return userService.current(authService.requireUserId(authorization));
    }

    @GetMapping
    public void listUsersBlocked() {
        throw new org.springframework.web.server.ResponseStatusException(
                org.springframework.http.HttpStatus.FORBIDDEN,
                "사용자 목록 조회는 허용되지 않습니다.");
    }

    @PatchMapping("/me")
    public UserResponse updateProfile(
            @RequestHeader(value = "Authorization", required = false) String authorization,
            @Validated @RequestBody UpdateProfileRequest request) {
        return userService.updateProfile(authService.requireUserId(authorization), request);
    }
}
