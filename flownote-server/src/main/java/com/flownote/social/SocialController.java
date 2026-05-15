package com.flownote.social;

import java.net.URI;
import java.util.List;
import java.util.UUID;

import org.springframework.http.ResponseEntity;
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
import com.flownote.social.SocialDtos.SocialMessageRequest;
import com.flownote.social.SocialDtos.SocialMessageResponse;
import com.flownote.social.SocialDtos.SocialRoomRequest;
import com.flownote.social.SocialDtos.SocialRoomResponse;

@RestController
@RequestMapping("/api/social")
public class SocialController {
    private final AuthService authService;
    private final SocialService socialService;

    public SocialController(AuthService authService, SocialService socialService) {
        this.authService = authService;
        this.socialService = socialService;
    }

    @GetMapping({"", "/"})
    public List<SocialRoomResponse> listRooms(@RequestHeader(value = "Authorization", required = false) String authorization) {
        return socialService.listRooms(authService.requireUserId(authorization));
    }

    @PostMapping({"", "/"})
    public ResponseEntity<SocialRoomResponse> createRoom(
            @RequestHeader(value = "Authorization", required = false) String authorization,
            @Validated @RequestBody SocialRoomRequest request) {
        SocialRoomResponse created = socialService.createRoom(authService.requireUserId(authorization), request);
        return ResponseEntity.created(URI.create("/api/social/" + created.id())).body(created);
    }

    @GetMapping("/{roomId}")
    public List<SocialMessageResponse> listMessages(
            @RequestHeader(value = "Authorization", required = false) String authorization,
            @PathVariable UUID roomId) {
        return socialService.listMessages(authService.requireUserId(authorization), roomId);
    }

    @DeleteMapping("/{roomId}")
    public ResponseEntity<Void> deleteRoom(
            @RequestHeader(value = "Authorization", required = false) String authorization,
            @PathVariable UUID roomId) {
        socialService.deleteRoom(authService.requireUserId(authorization), roomId);
        return ResponseEntity.noContent().build();
    }

    @PostMapping("/{roomId}")
    public ResponseEntity<SocialMessageResponse> createMessage(
            @RequestHeader(value = "Authorization", required = false) String authorization,
            @PathVariable UUID roomId,
            @Validated @RequestBody SocialMessageRequest request) {
        SocialMessageResponse created = socialService.createMessage(authService.requireUserId(authorization), roomId, request);
        return ResponseEntity.created(URI.create("/api/social/" + roomId + "/" + created.id())).body(created);
    }

    @DeleteMapping("/{roomId}/{messageId}")
    public SocialMessageResponse deleteMessage(
            @RequestHeader(value = "Authorization", required = false) String authorization,
            @PathVariable UUID roomId,
            @PathVariable UUID messageId) {
        return socialService.deleteMessage(authService.requireUserId(authorization), roomId, messageId);
    }
}
