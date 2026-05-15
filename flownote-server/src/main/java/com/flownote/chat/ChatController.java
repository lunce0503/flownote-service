package com.flownote.chat;

import java.util.List;
import java.util.Map;
import java.util.UUID;

import org.springframework.validation.annotation.Validated;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import com.flownote.auth.AuthService;
import com.flownote.chat.ChatDtos.ChatMessageRequest;
import com.flownote.chat.ChatDtos.ChatMessageResponse;

@RestController
@RequestMapping("/api/chat")
public class ChatController {
    private final AuthService authService;
    private final ChatService chatService;

    public ChatController(AuthService authService, ChatService chatService) {
        this.authService = authService;
        this.chatService = chatService;
    }

    @GetMapping({"", "/"})
    public List<ChatMessageResponse> list(@RequestHeader(value = "Authorization", required = false) String authorization) {
        return chatService.list(authService.requireUserId(authorization));
    }

    @PostMapping({"", "/"})
    public ChatMessageResponse create(
            @RequestHeader(value = "Authorization", required = false) String authorization,
            @Validated @RequestBody ChatMessageRequest request) {
        return chatService.create(authService.requireUserId(authorization), request);
    }

    @DeleteMapping("/{id}")
    public ChatMessageResponse delete(
            @RequestHeader(value = "Authorization", required = false) String authorization,
            @PathVariable UUID id) {
        return chatService.delete(authService.requireUserId(authorization), id);
    }

    @DeleteMapping({"", "/"})
    public Map<String, Integer> deleteAll(@RequestHeader(value = "Authorization", required = false) String authorization) {
        return Map.of("deletedCount", chatService.deleteAll(authService.requireUserId(authorization)));
    }
}
