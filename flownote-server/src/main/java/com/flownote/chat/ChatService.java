package com.flownote.chat;

import java.sql.ResultSet;
import java.sql.SQLException;
import java.time.OffsetDateTime;
import java.util.List;
import java.util.UUID;

import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.web.server.ResponseStatusException;

import com.flownote.chat.ChatDtos.ChatMessageRequest;
import com.flownote.chat.ChatDtos.ChatMessageResponse;

@Service
public class ChatService {
    private final JdbcTemplate jdbcTemplate;

    public ChatService(JdbcTemplate jdbcTemplate) {
        this.jdbcTemplate = jdbcTemplate;
    }

    public List<ChatMessageResponse> list(UUID userId) {
        return jdbcTemplate.query("""
                SELECT id, sender, message, timestamp
                FROM chat_messages
                WHERE user_id = ?
                ORDER BY timestamp ASC
                """, this::mapMessage, userId);
    }

    public ChatMessageResponse create(UUID userId, ChatMessageRequest request) {
        UUID id = request.id() == null ? UUID.randomUUID() : request.id();
        OffsetDateTime timestamp = request.timestamp() == null ? OffsetDateTime.now() : request.timestamp();
        return jdbcTemplate.queryForObject("""
                INSERT INTO chat_messages (id, user_id, sender, message, timestamp)
                VALUES (?, ?, ?, ?, ?)
                RETURNING id, sender, message, timestamp
                """, this::mapMessage, id, userId, request.sender(), request.message(), timestamp);
    }

    public ChatMessageResponse delete(UUID userId, UUID id) {
        return jdbcTemplate.query("""
                DELETE FROM chat_messages
                WHERE id = ? AND user_id = ?
                RETURNING id, sender, message, timestamp
                """, this::mapMessage, id, userId)
                .stream()
                .findFirst()
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "채팅 메시지를 찾을 수 없습니다."));
    }

    public int deleteAll(UUID userId) {
        return jdbcTemplate.update("DELETE FROM chat_messages WHERE user_id = ?", userId);
    }

    private ChatMessageResponse mapMessage(ResultSet rs, int rowNum) throws SQLException {
        return new ChatMessageResponse(
                rs.getObject("id", UUID.class),
                rs.getString("sender"),
                rs.getString("message"),
                rs.getObject("timestamp", OffsetDateTime.class));
    }
}
