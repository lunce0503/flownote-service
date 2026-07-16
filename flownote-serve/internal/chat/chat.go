package chat

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

// Spring ChatController/Service(/api/chat) 이식. 메시지 본문은 S3 오프로드.

type Message struct {
	ID        string    `json:"id"`
	Sender    string    `json:"sender"`
	Message   string    `json:"message"`
	Timestamp time.Time `json:"timestamp"`
}

type messageRequest struct {
	ID        string     `json:"id"`
	Sender    string     `json:"sender"`
	Message   string     `json:"message"`
	Timestamp *time.Time `json:"timestamp"`
}

type Repo struct {
	pool  *pgxpool.Pool
	store *storage.Store
}

func NewRepo(pool *pgxpool.Pool, store *storage.Store) *Repo { return &Repo{pool: pool, store: store} }

const messageColumns = `id::text, sender, message, COALESCE(message_object_key,''), timestamp`

func (r *Repo) scanMessage(ctx context.Context, row pgx.Row) (Message, error) {
	var m Message
	var body, objectKey string
	if err := row.Scan(&m.ID, &m.Sender, &body, &objectKey, &m.Timestamp); err != nil {
		return Message{}, err
	}
	m.Message = body
	if objectKey != "" {
		if obj, err := r.store.Get(ctx, objectKey); err == nil {
			m.Message = string(obj.Data)
		}
	}
	return m, nil
}

func (r *Repo) List(ctx context.Context, userID string) ([]Message, error) {
	rows, err := r.pool.Query(ctx, `
		SELECT `+messageColumns+`
		FROM chat_messages
		WHERE user_id = $1
		ORDER BY timestamp ASC
	`, userID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	messages := make([]Message, 0)
	for rows.Next() {
		m, err := r.scanMessage(ctx, rows)
		if err != nil {
			return nil, err
		}
		messages = append(messages, m)
	}
	return messages, rows.Err()
}

func (r *Repo) Create(ctx context.Context, userID string, req messageRequest) (Message, error) {
	id := strings.TrimSpace(req.ID)
	if id == "" {
		id = storage.NewUUID()
	}
	timestamp := time.Now()
	if req.Timestamp != nil {
		timestamp = *req.Timestamp
	}
	objectKey := fmt.Sprintf("chat-messages/%s/%s.txt", userID, id)
	publicURL, err := r.store.Put(ctx, objectKey, "text/plain; charset=utf-8", []byte(req.Message))
	if err != nil {
		return Message{}, err
	}
	return r.scanMessage(ctx, r.pool.QueryRow(ctx, `
		INSERT INTO chat_messages (id, user_id, sender, message, message_object_key, message_byte_size, message_public_url, timestamp)
		VALUES ($1, $2, $3, '', $4, $5, $6, $7)
		RETURNING `+messageColumns,
		id, userID, req.Sender, objectKey, len(req.Message), publicURL, timestamp))
}

func (r *Repo) Delete(ctx context.Context, userID, id string) (Message, error) {
	var objectKey string
	err := r.pool.QueryRow(ctx, `
		SELECT COALESCE(message_object_key,'') FROM chat_messages WHERE id = $1 AND user_id = $2
	`, id, userID).Scan(&objectKey)
	if err != nil && !errors.Is(err, pgx.ErrNoRows) {
		return Message{}, err
	}

	deleted, err := r.scanMessage(ctx, r.pool.QueryRow(ctx, `
		DELETE FROM chat_messages
		WHERE id = $1 AND user_id = $2
		RETURNING `+messageColumns, id, userID))
	if errors.Is(err, pgx.ErrNoRows) {
		return Message{}, httpjson.Errorf(http.StatusNotFound, "채팅 메시지를 찾을 수 없습니다.")
	}
	if err != nil {
		return Message{}, err
	}
	_ = r.store.Delete(ctx, objectKey)
	return deleted, nil
}

func (r *Repo) DeleteAll(ctx context.Context, userID string) (int, error) {
	rows, err := r.pool.Query(ctx, `
		SELECT message_object_key FROM chat_messages
		WHERE user_id = $1 AND message_object_key IS NOT NULL
	`, userID)
	if err != nil {
		return 0, err
	}
	objectKeys := make([]string, 0)
	for rows.Next() {
		var key string
		if rows.Scan(&key) == nil && key != "" {
			objectKeys = append(objectKeys, key)
		}
	}
	rows.Close()

	tag, err := r.pool.Exec(ctx, `DELETE FROM chat_messages WHERE user_id = $1`, userID)
	if err != nil {
		return 0, err
	}
	for _, key := range objectKeys {
		_ = r.store.Delete(ctx, key)
	}
	return int(tag.RowsAffected()), nil
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
	mux.Handle("GET /api/chat", p(h.list))
	mux.Handle("GET /api/chat/{$}", p(h.list))
	mux.Handle("POST /api/chat", p(h.create))
	mux.Handle("POST /api/chat/{$}", p(h.create))
	mux.Handle("DELETE /api/chat", p(h.deleteAll))
	mux.Handle("DELETE /api/chat/{$}", p(h.deleteAll))
	mux.Handle("DELETE /api/chat/{id}", p(h.delete))
}

func (h *Handler) list(w http.ResponseWriter, r *http.Request) {
	messages, err := h.repo.List(r.Context(), auth.UserID(r.Context()))
	if err != nil {
		httpjson.WriteError(w, err)
		return
	}
	httpjson.Write(w, http.StatusOK, messages)
}

func (h *Handler) create(w http.ResponseWriter, r *http.Request) {
	var req messageRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil ||
		strings.TrimSpace(req.Sender) == "" || strings.TrimSpace(req.Message) == "" {
		httpjson.WriteError(w, httpjson.Errorf(http.StatusBadRequest, "채팅 메시지 요청이 올바르지 않습니다."))
		return
	}
	created, err := h.repo.Create(r.Context(), auth.UserID(r.Context()), req)
	if err != nil {
		httpjson.WriteError(w, err)
		return
	}
	httpjson.Write(w, http.StatusOK, created)
}

func (h *Handler) delete(w http.ResponseWriter, r *http.Request) {
	deleted, err := h.repo.Delete(r.Context(), auth.UserID(r.Context()), r.PathValue("id"))
	if err != nil {
		httpjson.WriteError(w, err)
		return
	}
	httpjson.Write(w, http.StatusOK, deleted)
}

func (h *Handler) deleteAll(w http.ResponseWriter, r *http.Request) {
	count, err := h.repo.DeleteAll(r.Context(), auth.UserID(r.Context()))
	if err != nil {
		httpjson.WriteError(w, err)
		return
	}
	httpjson.Write(w, http.StatusOK, map[string]int{"deletedCount": count})
}
