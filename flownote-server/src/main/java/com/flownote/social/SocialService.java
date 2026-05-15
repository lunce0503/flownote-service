package com.flownote.social;

import java.sql.ResultSet;
import java.sql.SQLException;
import java.time.OffsetDateTime;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.UUID;

import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

import com.flownote.social.SocialDtos.SocialMessageRequest;
import com.flownote.social.SocialDtos.SocialMessageResponse;
import com.flownote.social.SocialDtos.SocialRoomMemberResponse;
import com.flownote.social.SocialDtos.SocialRoomRequest;
import com.flownote.social.SocialDtos.SocialRoomResponse;

@Service
public class SocialService {
    private final JdbcTemplate jdbcTemplate;

    public SocialService(JdbcTemplate jdbcTemplate) {
        this.jdbcTemplate = jdbcTemplate;
    }

    public List<SocialRoomResponse> listRooms(UUID userId) {
        List<SocialRoomRow> rooms = jdbcTemplate.query("""
                SELECT r.id, r.name, r.updated_at,
                       (
                           SELECT s.message
                           FROM social s
                           WHERE s.room_id = r.id
                           ORDER BY s.timestamp DESC
                           LIMIT 1
                       ) AS last_message
                FROM social_rooms r
                JOIN social_room_members m ON m.room_id = r.id
                WHERE m.user_id = ?
                ORDER BY r.updated_at DESC
                """,
                (rs, rowNum) -> new SocialRoomRow(
                        rs.getObject("id", UUID.class),
                        rs.getString("name"),
                        rs.getString("last_message"),
                        rs.getObject("updated_at", OffsetDateTime.class)),
                userId);

        Map<UUID, List<SocialRoomMemberResponse>> membersByRoomId = listMembersByRoomIds(
                rooms.stream().map(SocialRoomRow::id).toList());

        return rooms.stream()
                .map(room -> new SocialRoomResponse(
                        room.id(),
                        room.name(),
                        membersByRoomId.getOrDefault(room.id(), List.of()),
                        room.lastMessage(),
                        room.updatedAt()))
                .toList();
    }

    @Transactional
    public SocialRoomResponse createRoom(UUID userId, SocialRoomRequest request) {
        UUID roomId = UUID.randomUUID();
        Set<UUID> memberIds = new LinkedHashSet<>();
        memberIds.add(userId);

        if (request.participantIds() != null) {
            memberIds.addAll(findUserIdsByIds(request.participantIds()));
        }

        if (request.participantEmails() != null && !request.participantEmails().isEmpty()) {
            memberIds.addAll(findUserIdsByEmails(request.participantEmails()));
        }

        if (memberIds.size() < 2) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "대화 상대를 1명 이상 지정해야 합니다.");
        }

        jdbcTemplate.update("""
                INSERT INTO social_rooms (id, name, created_by, updated_at)
                VALUES (?, ?, ?, ?)
                """, roomId, normalizeRoomName(request.name()), userId, OffsetDateTime.now());

        for (UUID memberId : memberIds) {
            jdbcTemplate.update("""
                    INSERT INTO social_room_members (room_id, user_id)
                    VALUES (?, ?)
                    ON CONFLICT DO NOTHING
                    """, roomId, memberId);
        }

        return getRoom(userId, roomId);
    }

    public List<SocialMessageResponse> listMessages(UUID userId, UUID roomId) {
        requireRoomMember(userId, roomId);
        return jdbcTemplate.query("""
                SELECT s.id, s.room_id, s.user_id, u.nickname, s.message, s.timestamp, s.user_id = ? AS mine
                FROM social s
                JOIN users u ON u.id = s.user_id
                WHERE s.room_id = ?
                ORDER BY s.timestamp ASC
                LIMIT 500
                """, this::mapMessage, userId, roomId);
    }

    @Transactional
    public SocialMessageResponse createMessage(UUID userId, UUID roomId, SocialMessageRequest request) {
        requireRoomMember(userId, roomId);
        UUID id = UUID.randomUUID();
        OffsetDateTime timestamp = request.timestamp() == null ? OffsetDateTime.now() : request.timestamp();
        SocialMessageResponse created = jdbcTemplate.queryForObject("""
                INSERT INTO social (id, room_id, user_id, message, timestamp)
                VALUES (?, ?, ?, ?, ?)
                RETURNING id, room_id, user_id, (SELECT nickname FROM users WHERE id = ?) AS nickname, message, timestamp, true AS mine
                """, this::mapMessage, id, roomId, userId, request.message(), timestamp, userId);
        jdbcTemplate.update("UPDATE social_rooms SET updated_at = ? WHERE id = ?", timestamp, roomId);
        return created;
    }

    @Transactional
    public SocialMessageResponse deleteMessage(UUID userId, UUID roomId, UUID id) {
        requireRoomMember(userId, roomId);
        return jdbcTemplate.query("""
                WITH deleted AS (
                    DELETE FROM social
                    WHERE id = ? AND room_id = ? AND user_id = ?
                    RETURNING id, room_id, user_id, message, timestamp
                )
                SELECT deleted.id, deleted.room_id, deleted.user_id, u.nickname, deleted.message, deleted.timestamp, true AS mine
                FROM deleted
                JOIN users u ON u.id = deleted.user_id
                """, this::mapMessage, id, roomId, userId)
                .stream()
                .findFirst()
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "소셜 메시지를 찾을 수 없습니다."));
    }

    @Transactional
    public void deleteRoom(UUID userId, UUID roomId) {
        requireRoomMember(userId, roomId);
        int deleted = jdbcTemplate.update("DELETE FROM social_rooms WHERE id = ?", roomId);
        if (deleted == 0) {
            throw new ResponseStatusException(HttpStatus.NOT_FOUND, "톡방을 찾을 수 없습니다.");
        }
    }

    private SocialRoomResponse getRoom(UUID userId, UUID roomId) {
        requireRoomMember(userId, roomId);
        return jdbcTemplate.query("""
                SELECT r.id, r.name, r.updated_at,
                       (
                           SELECT s.message
                           FROM social s
                           WHERE s.room_id = r.id
                           ORDER BY s.timestamp DESC
                           LIMIT 1
                       ) AS last_message
                FROM social_rooms r
                WHERE r.id = ?
                """,
                (rs, rowNum) -> new SocialRoomResponse(
                        rs.getObject("id", UUID.class),
                        rs.getString("name"),
                        listMembers(rs.getObject("id", UUID.class)),
                        rs.getString("last_message"),
                        rs.getObject("updated_at", OffsetDateTime.class)),
                roomId)
                .stream()
                .findFirst()
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "톡방을 찾을 수 없습니다."));
    }

    private List<SocialRoomMemberResponse> listMembers(UUID roomId) {
        return jdbcTemplate.query("""
                SELECT u.id, u.username, u.nickname
                FROM social_room_members m
                JOIN users u ON u.id = m.user_id
                WHERE m.room_id = ?
                ORDER BY u.nickname ASC
                """,
                (rs, rowNum) -> new SocialRoomMemberResponse(
                        rs.getObject("id", UUID.class),
                        rs.getString("username"),
                        rs.getString("nickname")),
                roomId);
    }

    private Map<UUID, List<SocialRoomMemberResponse>> listMembersByRoomIds(List<UUID> roomIds) {
        if (roomIds.isEmpty()) {
            return Map.of();
        }

        Map<UUID, List<SocialRoomMemberResponse>> membersByRoomId = new HashMap<>();
        jdbcTemplate.query(connection -> {
            var statement = connection.prepareStatement("""
                    SELECT m.room_id, u.id, u.username, u.nickname
                    FROM social_room_members m
                    JOIN users u ON u.id = m.user_id
                    WHERE m.room_id = ANY(?)
                    ORDER BY m.room_id, u.nickname ASC
                    """);
            var array = connection.createArrayOf("uuid", roomIds.toArray());
            statement.setArray(1, array);
            return statement;
        }, rs -> {
            UUID roomId = rs.getObject("room_id", UUID.class);
            membersByRoomId.computeIfAbsent(roomId, ignored -> new ArrayList<>())
                    .add(new SocialRoomMemberResponse(
                            rs.getObject("id", UUID.class),
                            rs.getString("username"),
                            rs.getString("nickname")));
        });
        return membersByRoomId;
    }

    private List<UUID> findUserIdsByIds(List<UUID> ids) {
        List<UUID> userIds = new ArrayList<>();
        for (UUID id : ids) {
            if (id == null) {
                continue;
            }

            UUID userId = jdbcTemplate.query("""
                    SELECT id
                    FROM users
                    WHERE id = ?
                    LIMIT 1
                    """, (rs, rowNum) -> rs.getObject("id", UUID.class), id)
                    .stream()
                    .findFirst()
                    .orElseThrow(() -> new ResponseStatusException(HttpStatus.BAD_REQUEST, "존재하지 않는 사용자입니다: " + id));
            userIds.add(userId);
        }
        return userIds;
    }

    private List<UUID> findUserIdsByEmails(List<String> emails) {
        List<UUID> userIds = new ArrayList<>();
        for (String email : emails) {
            String normalizedEmail = email == null ? "" : email.trim().toLowerCase();
            if (normalizedEmail.isBlank()) {
                continue;
            }

            UUID userId = jdbcTemplate.query("""
                    SELECT id
                    FROM users
                    WHERE lower(email) = ?
                    LIMIT 1
                    """, (rs, rowNum) -> rs.getObject("id", UUID.class), normalizedEmail)
                    .stream()
                    .findFirst()
                    .orElseThrow(() -> new ResponseStatusException(HttpStatus.BAD_REQUEST, "존재하지 않는 사용자 이메일입니다: " + normalizedEmail));
            userIds.add(userId);
        }
        return userIds;
    }

    private void requireRoomMember(UUID userId, UUID roomId) {
        boolean isMember = jdbcTemplate.query("""
                SELECT 1
                FROM social_room_members
                WHERE room_id = ? AND user_id = ?
                LIMIT 1
                """, (rs, rowNum) -> true, roomId, userId)
                .stream()
                .findFirst()
                .orElse(false);

        if (!isMember) {
            throw new ResponseStatusException(HttpStatus.NOT_FOUND, "톡방을 찾을 수 없습니다.");
        }
    }

    private String normalizeRoomName(String name) {
        if (name == null || name.trim().isBlank()) {
            return null;
        }
        return name.trim();
    }

    private SocialMessageResponse mapMessage(ResultSet rs, int rowNum) throws SQLException {
        return new SocialMessageResponse(
                rs.getObject("id", UUID.class),
                rs.getObject("room_id", UUID.class),
                rs.getObject("user_id", UUID.class),
                rs.getString("nickname"),
                rs.getString("message"),
                rs.getObject("timestamp", OffsetDateTime.class),
                rs.getBoolean("mine"));
    }

    private record SocialRoomRow(UUID id, String name, String lastMessage, OffsetDateTime updatedAt) {
    }
}
