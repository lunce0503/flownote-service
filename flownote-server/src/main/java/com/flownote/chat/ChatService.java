package com.flownote.chat;

import java.sql.ResultSet;
import java.sql.SQLException;
import java.time.OffsetDateTime;
import java.util.List;
import java.util.UUID;

import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.transaction.support.TransactionSynchronization;
import org.springframework.transaction.support.TransactionSynchronizationManager;
import org.springframework.web.server.ResponseStatusException;

import com.flownote.storage.CanvasAssetStorage;
import com.flownote.storage.CanvasAssetStorage.StoredCanvasAsset;
import com.flownote.chat.ChatDtos.ChatMessageRequest;
import com.flownote.chat.ChatDtos.ChatMessageResponse;

@Service
public class ChatService {
    private final JdbcTemplate jdbcTemplate;
    private final CanvasAssetStorage assetStorage;

    public ChatService(JdbcTemplate jdbcTemplate, CanvasAssetStorage assetStorage) {
        this.jdbcTemplate = jdbcTemplate;
        this.assetStorage = assetStorage;
    }

    public List<ChatMessageResponse> list(UUID userId) {
        return jdbcTemplate.query("""
                SELECT id, sender, message, message_object_key, timestamp
                FROM chat_messages
                WHERE user_id = ?
                ORDER BY timestamp ASC
                """, this::mapMessage, userId);
    }

    @Transactional
    public ChatMessageResponse create(UUID userId, ChatMessageRequest request) {
        UUID id = request.id() == null ? UUID.randomUUID() : request.id();
        OffsetDateTime timestamp = request.timestamp() == null ? OffsetDateTime.now() : request.timestamp();
        String objectKey = "chat-messages/%s/%s.txt".formatted(userId, id);
        StoredCanvasAsset stored = assetStorage.putText(objectKey, request.message());
        return jdbcTemplate.queryForObject("""
                INSERT INTO chat_messages (id, user_id, sender, message, message_object_key, message_byte_size, message_public_url, timestamp)
                VALUES (?, ?, ?, '', ?, ?, ?, ?)
                RETURNING id, sender, message, message_object_key, timestamp
                """, this::mapMessage, id, userId, request.sender(), objectKey, stored.byteSize(), stored.publicUrl(), timestamp);
    }

    @Transactional
    public ChatMessageResponse delete(UUID userId, UUID id) {
        String objectKey = jdbcTemplate.query("""
                SELECT message_object_key
                FROM chat_messages
                WHERE id = ? AND user_id = ?
                """, (rs, rowNum) -> rs.getString("message_object_key"), id, userId)
                .stream()
                .findFirst()
                .orElse("");
        ChatMessageResponse deleted = jdbcTemplate.query("""
                DELETE FROM chat_messages
                WHERE id = ? AND user_id = ?
                RETURNING id, sender, message, message_object_key, timestamp
                """, this::mapMessage, id, userId)
                .stream()
                .findFirst()
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "채팅 메시지를 찾을 수 없습니다."));
        deleteAfterCommit(objectKey);
        return deleted;
    }

    @Transactional
    public int deleteAll(UUID userId) {
        List<String> objectKeys = jdbcTemplate.queryForList("""
                SELECT message_object_key
                FROM chat_messages
                WHERE user_id = ? AND message_object_key IS NOT NULL
                """, String.class, userId);
        int deleted = jdbcTemplate.update("DELETE FROM chat_messages WHERE user_id = ?", userId);
        deleteAfterCommit(objectKeys);
        return deleted;
    }

    private ChatMessageResponse mapMessage(ResultSet rs, int rowNum) throws SQLException {
        return new ChatMessageResponse(
                rs.getObject("id", UUID.class),
                rs.getString("sender"),
                readMessage(rs.getString("message"), rs.getString("message_object_key")),
                rs.getObject("timestamp", OffsetDateTime.class));
    }

    private String readMessage(String fallback, String objectKey) {
        return objectKey == null || objectKey.isBlank() ? fallback : assetStorage.readText(objectKey);
    }

    private void deleteAfterCommit(String objectKey) {
        if (objectKey == null || objectKey.isBlank()) {
            return;
        }
        deleteAfterCommit(List.of(objectKey));
    }

    private void deleteAfterCommit(List<String> objectKeys) {
        List<String> keys = objectKeys.stream()
                .filter(key -> key != null && !key.isBlank())
                .distinct()
                .toList();
        if (keys.isEmpty()) {
            return;
        }
        if (!TransactionSynchronizationManager.isActualTransactionActive()) {
            keys.forEach(assetStorage::delete);
            return;
        }
        TransactionSynchronizationManager.registerSynchronization(new TransactionSynchronization() {
            @Override
            public void afterCommit() {
                keys.forEach(assetStorage::delete);
            }
        });
    }
}
