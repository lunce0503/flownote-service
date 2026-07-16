package social

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"strings"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/flownote/flownote-serve/internal/auth"
	"github.com/flownote/flownote-serve/internal/httpjson"
	"github.com/flownote/flownote-serve/internal/storage"
)

// Spring SocialController/Service(/api/social) 이식.
// 방 멤버십 검사(비멤버는 404), 메시지 본문 S3 오프로드, 마지막 메시지 LATERAL 조회 유지.

var errRoomNotFound = httpjson.Errorf(http.StatusNotFound, "톡방을 찾을 수 없습니다.")

type Member struct {
	ID       string `json:"id"`
	Username string `json:"username"`
	Nickname string `json:"nickname"`
}

type Room struct {
	ID          string    `json:"id"`
	Name        *string   `json:"name,omitempty"`
	Members     []Member  `json:"members"`
	LastMessage *string   `json:"last_message,omitempty"`
	UpdatedAt   time.Time `json:"updated_at"`
}

type Message struct {
	ID        string    `json:"id"`
	RoomID    string    `json:"room_id"`
	UserID    string    `json:"user_id"`
	Nickname  string    `json:"nickname"`
	Message   string    `json:"message"`
	Timestamp time.Time `json:"timestamp"`
	Mine      bool      `json:"mine"`
}

type roomRequest struct {
	ID                string   `json:"id"`
	Name              *string  `json:"name"`
	ParticipantIDs    []string `json:"participant_ids"`
	ParticipantIDsAlt []string `json:"participantIds"`
	ParticipantEmails []string `json:"participant_emails"`
	ParticipantEmailsAlt []string `json:"participantEmails"`
}

type messageRequest struct {
	ID        string     `json:"id"`
	Message   string     `json:"message"`
	Timestamp *time.Time `json:"timestamp"`
}

type Repo struct {
	pool  *pgxpool.Pool
	store *storage.Store
}

func NewRepo(pool *pgxpool.Pool, store *storage.Store) *Repo { return &Repo{pool: pool, store: store} }

func (r *Repo) readOffloaded(ctx context.Context, inline *string, objectKey string) *string {
	if objectKey == "" {
		return inline
	}
	if obj, err := r.store.Get(ctx, objectKey); err == nil {
		s := string(obj.Data)
		return &s
	}
	return inline
}

func (r *Repo) requireRoomMember(ctx context.Context, userID, roomID string) error {
	var isMember bool
	if err := r.pool.QueryRow(ctx, `
		SELECT EXISTS (SELECT 1 FROM social_room_members WHERE room_id = $1 AND user_id = $2)
	`, roomID, userID).Scan(&isMember); err != nil {
		return err
	}
	if !isMember {
		return errRoomNotFound
	}
	return nil
}

func (r *Repo) listMembers(ctx context.Context, roomIDs []string) (map[string][]Member, error) {
	membersByRoom := make(map[string][]Member)
	if len(roomIDs) == 0 {
		return membersByRoom, nil
	}
	rows, err := r.pool.Query(ctx, `
		SELECT m.room_id::text, u.id::text, u.username, u.nickname
		FROM social_room_members m
		JOIN users u ON u.id = m.user_id
		WHERE m.room_id = ANY($1::uuid[])
		ORDER BY m.room_id, u.nickname ASC
	`, roomIDs)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	for rows.Next() {
		var roomID string
		var member Member
		if err := rows.Scan(&roomID, &member.ID, &member.Username, &member.Nickname); err != nil {
			return nil, err
		}
		membersByRoom[roomID] = append(membersByRoom[roomID], member)
	}
	return membersByRoom, rows.Err()
}

func (r *Repo) ListRooms(ctx context.Context, userID string) ([]Room, error) {
	rows, err := r.pool.Query(ctx, `
		SELECT r.id::text, r.name, r.updated_at,
		       latest.message, COALESCE(latest.message_object_key,'')
		FROM social_rooms r
		JOIN social_room_members m ON m.room_id = r.id
		LEFT JOIN LATERAL (
			SELECT s.message, s.message_object_key
			FROM social s
			WHERE s.room_id = r.id
			ORDER BY s.timestamp DESC
			LIMIT 1
		) latest ON true
		WHERE m.user_id = $1
		ORDER BY r.updated_at DESC
	`, userID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	rooms := make([]Room, 0)
	roomIDs := make([]string, 0)
	for rows.Next() {
		var room Room
		var lastMessage *string
		var lastKey string
		if err := rows.Scan(&room.ID, &room.Name, &room.UpdatedAt, &lastMessage, &lastKey); err != nil {
			return nil, err
		}
		room.LastMessage = r.readOffloaded(ctx, lastMessage, lastKey)
		room.Members = []Member{}
		rooms = append(rooms, room)
		roomIDs = append(roomIDs, room.ID)
	}
	if err := rows.Err(); err != nil {
		return nil, err
	}

	membersByRoom, err := r.listMembers(ctx, roomIDs)
	if err != nil {
		return nil, err
	}
	for i := range rooms {
		if members, ok := membersByRoom[rooms[i].ID]; ok {
			rooms[i].Members = members
		}
	}
	return rooms, nil
}

func (r *Repo) getRoom(ctx context.Context, userID, roomID string) (Room, error) {
	if err := r.requireRoomMember(ctx, userID, roomID); err != nil {
		return Room{}, err
	}
	var room Room
	var lastMessage *string
	var lastKey string
	err := r.pool.QueryRow(ctx, `
		SELECT r.id::text, r.name, r.updated_at,
		       latest.message, COALESCE(latest.message_object_key,'')
		FROM social_rooms r
		LEFT JOIN LATERAL (
			SELECT s.message, s.message_object_key
			FROM social s
			WHERE s.room_id = r.id
			ORDER BY s.timestamp DESC
			LIMIT 1
		) latest ON true
		WHERE r.id = $1
	`, roomID).Scan(&room.ID, &room.Name, &room.UpdatedAt, &lastMessage, &lastKey)
	if errors.Is(err, pgx.ErrNoRows) {
		return Room{}, errRoomNotFound
	}
	if err != nil {
		return Room{}, err
	}
	room.LastMessage = r.readOffloaded(ctx, lastMessage, lastKey)
	membersByRoom, err := r.listMembers(ctx, []string{room.ID})
	if err != nil {
		return Room{}, err
	}
	room.Members = membersByRoom[room.ID]
	if room.Members == nil {
		room.Members = []Member{}
	}
	return room, nil
}

func (r *Repo) findUserIDs(ctx context.Context, ids []string, emails []string) ([]string, error) {
	userIDs := make([]string, 0, len(ids)+len(emails))
	for _, id := range ids {
		if strings.TrimSpace(id) == "" {
			continue
		}
		var found string
		err := r.pool.QueryRow(ctx, `SELECT id::text FROM users WHERE id = $1 LIMIT 1`, id).Scan(&found)
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, httpjson.Errorf(http.StatusBadRequest, "존재하지 않는 사용자입니다: "+id)
		}
		if err != nil {
			return nil, err
		}
		userIDs = append(userIDs, found)
	}
	for _, email := range emails {
		normalized := strings.ToLower(strings.TrimSpace(email))
		if normalized == "" {
			continue
		}
		var found string
		err := r.pool.QueryRow(ctx, `SELECT id::text FROM users WHERE lower(email) = $1 LIMIT 1`, normalized).Scan(&found)
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, httpjson.Errorf(http.StatusBadRequest, "존재하지 않는 사용자 이메일입니다: "+normalized)
		}
		if err != nil {
			return nil, err
		}
		userIDs = append(userIDs, found)
	}
	return userIDs, nil
}

func (r *Repo) CreateRoom(ctx context.Context, userID string, req roomRequest) (Room, error) {
	roomID := storage.NewUUID()
	memberIDs := []string{userID}
	seen := map[string]bool{userID: true}

	participantIDs := append(append([]string{}, req.ParticipantIDs...), req.ParticipantIDsAlt...)
	participantEmails := append(append([]string{}, req.ParticipantEmails...), req.ParticipantEmailsAlt...)
	found, err := r.findUserIDs(ctx, participantIDs, participantEmails)
	if err != nil {
		return Room{}, err
	}
	for _, id := range found {
		if !seen[id] {
			seen[id] = true
			memberIDs = append(memberIDs, id)
		}
	}
	if len(memberIDs) < 2 {
		return Room{}, httpjson.Errorf(http.StatusBadRequest, "대화 상대를 1명 이상 지정해야 합니다.")
	}

	var name *string
	if req.Name != nil && strings.TrimSpace(*req.Name) != "" {
		trimmed := strings.TrimSpace(*req.Name)
		name = &trimmed
	}

	tx, err := r.pool.Begin(ctx)
	if err != nil {
		return Room{}, err
	}
	defer tx.Rollback(ctx)

	if _, err := tx.Exec(ctx, `
		INSERT INTO social_rooms (id, name, created_by, updated_at)
		VALUES ($1, $2, $3, NOW())
	`, roomID, name, userID); err != nil {
		return Room{}, err
	}
	for _, memberID := range memberIDs {
		if _, err := tx.Exec(ctx, `
			INSERT INTO social_room_members (room_id, user_id)
			VALUES ($1, $2)
			ON CONFLICT DO NOTHING
		`, roomID, memberID); err != nil {
			return Room{}, err
		}
	}
	if err := tx.Commit(ctx); err != nil {
		return Room{}, err
	}
	return r.getRoom(ctx, userID, roomID)
}

const messageColumns = `s.id::text, s.room_id::text, s.user_id::text, u.nickname, s.message, COALESCE(s.message_object_key,''), s.timestamp`

func (r *Repo) ListMessages(ctx context.Context, userID, roomID string) ([]Message, error) {
	if err := r.requireRoomMember(ctx, userID, roomID); err != nil {
		return nil, err
	}
	rows, err := r.pool.Query(ctx, `
		SELECT `+messageColumns+`, s.user_id = $1 AS mine
		FROM social s
		JOIN users u ON u.id = s.user_id
		WHERE s.room_id = $2
		ORDER BY s.timestamp ASC
		LIMIT 500
	`, userID, roomID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	messages := make([]Message, 0)
	for rows.Next() {
		var m Message
		var inline, objectKey string
		if err := rows.Scan(&m.ID, &m.RoomID, &m.UserID, &m.Nickname, &inline, &objectKey, &m.Timestamp, &m.Mine); err != nil {
			return nil, err
		}
		if body := r.readOffloaded(ctx, &inline, objectKey); body != nil {
			m.Message = *body
		}
		messages = append(messages, m)
	}
	return messages, rows.Err()
}

func (r *Repo) CreateMessage(ctx context.Context, userID, roomID string, req messageRequest) (Message, error) {
	if err := r.requireRoomMember(ctx, userID, roomID); err != nil {
		return Message{}, err
	}
	id := storage.NewUUID()
	timestamp := time.Now()
	if req.Timestamp != nil {
		timestamp = *req.Timestamp
	}
	objectKey := fmt.Sprintf("social-messages/%s/%s/%s.txt", roomID, userID, id)
	publicURL, err := r.store.Put(ctx, objectKey, "text/plain; charset=utf-8", []byte(req.Message))
	if err != nil {
		return Message{}, err
	}

	var m Message
	var inline, storedKey string
	err = r.pool.QueryRow(ctx, `
		INSERT INTO social (id, room_id, user_id, message, message_object_key, message_byte_size, message_public_url, timestamp)
		VALUES ($1, $2, $3, '', $4, $5, $6, $7)
		RETURNING id::text, room_id::text, user_id::text,
		          (SELECT nickname FROM users WHERE id = $3), message, COALESCE(message_object_key,''), timestamp, true
	`, id, roomID, userID, objectKey, len(req.Message), publicURL, timestamp).
		Scan(&m.ID, &m.RoomID, &m.UserID, &m.Nickname, &inline, &storedKey, &m.Timestamp, &m.Mine)
	if err != nil {
		return Message{}, err
	}
	if body := r.readOffloaded(ctx, &inline, storedKey); body != nil {
		m.Message = *body
	}
	if _, err := r.pool.Exec(ctx, `UPDATE social_rooms SET updated_at = $1 WHERE id = $2`, timestamp, roomID); err != nil {
		return Message{}, err
	}
	return m, nil
}

func (r *Repo) DeleteMessage(ctx context.Context, userID, roomID, id string) (Message, error) {
	if err := r.requireRoomMember(ctx, userID, roomID); err != nil {
		return Message{}, err
	}
	var objectKey string
	err := r.pool.QueryRow(ctx, `
		SELECT COALESCE(message_object_key,'') FROM social WHERE id = $1 AND room_id = $2 AND user_id = $3
	`, id, roomID, userID).Scan(&objectKey)
	if err != nil && !errors.Is(err, pgx.ErrNoRows) {
		return Message{}, err
	}

	var m Message
	var inline, storedKey string
	err = r.pool.QueryRow(ctx, `
		WITH deleted AS (
			DELETE FROM social
			WHERE id = $1 AND room_id = $2 AND user_id = $3
			RETURNING id, room_id, user_id, message, message_object_key, timestamp
		)
		SELECT deleted.id::text, deleted.room_id::text, deleted.user_id::text, u.nickname,
		       deleted.message, COALESCE(deleted.message_object_key,''), deleted.timestamp, true
		FROM deleted
		JOIN users u ON u.id = deleted.user_id
	`, id, roomID, userID).Scan(&m.ID, &m.RoomID, &m.UserID, &m.Nickname, &inline, &storedKey, &m.Timestamp, &m.Mine)
	if errors.Is(err, pgx.ErrNoRows) {
		return Message{}, httpjson.Errorf(http.StatusNotFound, "소셜 메시지를 찾을 수 없습니다.")
	}
	if err != nil {
		return Message{}, err
	}
	if body := r.readOffloaded(ctx, &inline, storedKey); body != nil {
		m.Message = *body
	}
	_ = r.store.Delete(ctx, objectKey)
	return m, nil
}

func (r *Repo) DeleteRoom(ctx context.Context, userID, roomID string) error {
	if err := r.requireRoomMember(ctx, userID, roomID); err != nil {
		return err
	}
	rows, err := r.pool.Query(ctx, `
		SELECT message_object_key FROM social
		WHERE room_id = $1 AND message_object_key IS NOT NULL
	`, roomID)
	if err != nil {
		return err
	}
	objectKeys := make([]string, 0)
	for rows.Next() {
		var key string
		if rows.Scan(&key) == nil && key != "" {
			objectKeys = append(objectKeys, key)
		}
	}
	rows.Close()

	tag, err := r.pool.Exec(ctx, `DELETE FROM social_rooms WHERE id = $1`, roomID)
	if err != nil {
		return err
	}
	if tag.RowsAffected() == 0 {
		return errRoomNotFound
	}
	for _, key := range objectKeys {
		_ = r.store.Delete(ctx, key)
	}
	return nil
}

// ---- handler ----

type Handler struct {
	repo *Repo
	auth *auth.Authenticator
}

func NewHandler(repo *Repo, authenticator *auth.Authenticator) *Handler {
	return &Handler{repo: repo, auth: authenticator}
}

func (h *Handler) Register(mux *http.ServeMux) {
	p := func(fn http.HandlerFunc) http.Handler { return h.auth.Middleware(fn) }
	mux.Handle("GET /api/social", p(h.listRooms))
	mux.Handle("GET /api/social/{$}", p(h.listRooms))
	mux.Handle("POST /api/social", p(h.createRoom))
	mux.Handle("POST /api/social/{$}", p(h.createRoom))
	mux.Handle("GET /api/social/{roomId}", p(h.listMessages))
	mux.Handle("DELETE /api/social/{roomId}", p(h.deleteRoom))
	mux.Handle("POST /api/social/{roomId}", p(h.createMessage))
	mux.Handle("DELETE /api/social/{roomId}/{messageId}", p(h.deleteMessage))
}

func (h *Handler) listRooms(w http.ResponseWriter, r *http.Request) {
	rooms, err := h.repo.ListRooms(r.Context(), auth.UserID(r.Context()))
	if err != nil {
		httpjson.WriteError(w, err)
		return
	}
	httpjson.Write(w, http.StatusOK, rooms)
}

func (h *Handler) createRoom(w http.ResponseWriter, r *http.Request) {
	var req roomRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		httpjson.WriteError(w, httpjson.Errorf(http.StatusBadRequest, "톡방 요청이 올바르지 않습니다."))
		return
	}
	room, err := h.repo.CreateRoom(r.Context(), auth.UserID(r.Context()), req)
	if err != nil {
		httpjson.WriteError(w, err)
		return
	}
	w.Header().Set("Location", "/api/social/"+room.ID)
	httpjson.Write(w, http.StatusCreated, room)
}

func (h *Handler) listMessages(w http.ResponseWriter, r *http.Request) {
	messages, err := h.repo.ListMessages(r.Context(), auth.UserID(r.Context()), r.PathValue("roomId"))
	if err != nil {
		httpjson.WriteError(w, err)
		return
	}
	httpjson.Write(w, http.StatusOK, messages)
}

func (h *Handler) createMessage(w http.ResponseWriter, r *http.Request) {
	var req messageRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil ||
		strings.TrimSpace(req.Message) == "" || len(req.Message) > 4000 {
		httpjson.WriteError(w, httpjson.Errorf(http.StatusBadRequest, "메시지 요청이 올바르지 않습니다."))
		return
	}
	created, err := h.repo.CreateMessage(r.Context(), auth.UserID(r.Context()), r.PathValue("roomId"), req)
	if err != nil {
		httpjson.WriteError(w, err)
		return
	}
	w.Header().Set("Location", "/api/social/"+created.RoomID+"/"+created.ID)
	httpjson.Write(w, http.StatusCreated, created)
}

func (h *Handler) deleteMessage(w http.ResponseWriter, r *http.Request) {
	deleted, err := h.repo.DeleteMessage(r.Context(), auth.UserID(r.Context()), r.PathValue("roomId"), r.PathValue("messageId"))
	if err != nil {
		httpjson.WriteError(w, err)
		return
	}
	httpjson.Write(w, http.StatusOK, deleted)
}

func (h *Handler) deleteRoom(w http.ResponseWriter, r *http.Request) {
	if err := h.repo.DeleteRoom(r.Context(), auth.UserID(r.Context()), r.PathValue("roomId")); err != nil {
		httpjson.WriteError(w, err)
		return
	}
	w.WriteHeader(http.StatusNoContent)
}
