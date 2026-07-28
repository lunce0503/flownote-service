package feedback

import (
	"context"
	"encoding/json"
	"net/http"
	"strings"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/flownote/flownote-serve/internal/auth"
	"github.com/flownote/flownote-serve/internal/httpjson"
	"github.com/flownote/flownote-serve/internal/storage"
)

// feedback: 설정 화면의 "사용자 피드백" 창구를 DB에 적재한다.
// 계약: 응답 snake_case(다른 도메인과 동일). 본인 피드백만 조회 가능하고,
// 전체 조회는 관리자 전용이다.

const (
	maxCategoryLength = 40
	maxMessageLength  = 4000
	maxContactLength  = 200
)

type Feedback struct {
	ID        string    `json:"id"`
	Category  string    `json:"category"`
	Message   string    `json:"message"`
	Contact   string    `json:"contact"`
	Status    string    `json:"status"`
	CreatedAt time.Time `json:"created_at"`
	// 관리자 전체 조회에서만 채워진다.
	UserID string `json:"user_id,omitempty"`
}

type createRequest struct {
	Category string `json:"category"`
	Message  string `json:"message"`
	Contact  string `json:"contact"`
}

// EnsureSchema는 user_feedback 테이블을 없으면 생성한다(idempotent).
// flownote-serve에는 마이그레이션 러너가 없어 diary와 동일하게 시작 시 보장한다.
func EnsureSchema(ctx context.Context, pool *pgxpool.Pool) error {
	_, err := pool.Exec(ctx, `
		CREATE TABLE IF NOT EXISTS user_feedback (
			id UUID PRIMARY KEY,
			user_id UUID NOT NULL,
			category TEXT NOT NULL DEFAULT '',
			message TEXT NOT NULL,
			contact TEXT NOT NULL DEFAULT '',
			status TEXT NOT NULL DEFAULT 'NEW',
			created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
		);
		CREATE INDEX IF NOT EXISTS idx_user_feedback_user_created
			ON user_feedback (user_id, created_at DESC);
	`)
	return err
}

type Repo struct {
	pool *pgxpool.Pool
}

func NewRepo(pool *pgxpool.Pool) *Repo { return &Repo{pool: pool} }

// clip은 앞뒤 공백을 제거하고 최대 길이로 자른다(과도한 입력 방어).
func clip(value string, max int) string {
	trimmed := strings.TrimSpace(value)
	if len(trimmed) > max {
		return trimmed[:max]
	}
	return trimmed
}

const columns = `id::text, category, message, contact, status, created_at`

func scan(row pgx.Row) (Feedback, error) {
	var item Feedback
	if err := row.Scan(&item.ID, &item.Category, &item.Message, &item.Contact, &item.Status, &item.CreatedAt); err != nil {
		return Feedback{}, err
	}
	return item, nil
}

func (r *Repo) Create(ctx context.Context, userID string, req createRequest) (Feedback, error) {
	message := clip(req.Message, maxMessageLength)
	if message == "" {
		return Feedback{}, httpjson.Errorf(http.StatusBadRequest, "피드백 내용을 입력해 주세요.")
	}
	return scan(r.pool.QueryRow(ctx, `
		INSERT INTO user_feedback (id, user_id, category, message, contact)
		VALUES ($1, $2, $3, $4, $5)
		RETURNING `+columns,
		storage.NewUUID(), userID, clip(req.Category, maxCategoryLength), message, clip(req.Contact, maxContactLength)))
}

// ListByUser는 본인이 보낸 피드백을 최신순으로 돌려준다.
func (r *Repo) ListByUser(ctx context.Context, userID string, limit int) ([]Feedback, error) {
	rows, err := r.pool.Query(ctx, `
		SELECT `+columns+`
		FROM user_feedback
		WHERE user_id = $1
		ORDER BY created_at DESC
		LIMIT $2
	`, userID, limit)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	items := make([]Feedback, 0)
	for rows.Next() {
		item, err := scan(rows)
		if err != nil {
			return nil, err
		}
		items = append(items, item)
	}
	return items, rows.Err()
}

// ListAll은 관리자용 전체 조회다(user_id 포함).
func (r *Repo) ListAll(ctx context.Context, limit int) ([]Feedback, error) {
	rows, err := r.pool.Query(ctx, `
		SELECT `+columns+`, user_id::text
		FROM user_feedback
		ORDER BY created_at DESC
		LIMIT $1
	`, limit)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	items := make([]Feedback, 0)
	for rows.Next() {
		var item Feedback
		if err := rows.Scan(&item.ID, &item.Category, &item.Message, &item.Contact,
			&item.Status, &item.CreatedAt, &item.UserID); err != nil {
			return nil, err
		}
		items = append(items, item)
	}
	return items, rows.Err()
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
	mux.Handle("POST /api/feedback", p(h.create))
	mux.Handle("GET /api/feedback", p(h.listMine))
	// 전체 조회는 관리자만.
	mux.Handle("GET /api/feedback/all", h.auth.AdminMiddleware(http.HandlerFunc(h.listAll)))
}

func (h *Handler) create(w http.ResponseWriter, r *http.Request) {
	var req createRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		httpjson.WriteError(w, httpjson.Errorf(http.StatusBadRequest, "피드백 데이터가 필요합니다."))
		return
	}
	created, err := h.repo.Create(r.Context(), auth.UserID(r.Context()), req)
	if err != nil {
		httpjson.WriteError(w, err)
		return
	}
	httpjson.Write(w, http.StatusCreated, created)
}

func (h *Handler) listMine(w http.ResponseWriter, r *http.Request) {
	items, err := h.repo.ListByUser(r.Context(), auth.UserID(r.Context()), 50)
	if err != nil {
		httpjson.WriteError(w, err)
		return
	}
	httpjson.Write(w, http.StatusOK, items)
}

func (h *Handler) listAll(w http.ResponseWriter, r *http.Request) {
	items, err := h.repo.ListAll(r.Context(), 200)
	if err != nil {
		httpjson.WriteError(w, err)
		return
	}
	httpjson.Write(w, http.StatusOK, items)
}
