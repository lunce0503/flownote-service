package canvas

import (
	"context"
	"net/http"
	"strconv"
	"time"
)

// 관리자 진단 API — Spring CanvasAdminController의 summary/events를 이관했다.
// 프론트 /admin/canvas 화면이 소비하는 응답 형태(snake_case 이벤트 필드, summary 구조)를 유지한다.

// RegisterAdmin은 관리자 진단 라우트를 등록한다.
func (h *Handler) RegisterAdmin(mux *http.ServeMux) {
	a := func(fn http.HandlerFunc) http.Handler { return h.auth.AdminMiddleware(fn) }
	mux.Handle("GET /api/admin/canvas/summary", a(h.adminSummary))
	mux.Handle("GET /api/admin/canvas/events", a(h.adminEvents))
}

func (h *Handler) adminSummary(w http.ResponseWriter, r *http.Request) {
	resp, err := h.repo.AdminSummary(r.Context())
	respond(w, resp, err)
}

func (h *Handler) adminEvents(w http.ResponseWriter, r *http.Request) {
	limit := 100
	if v := r.URL.Query().Get("limit"); v != "" {
		if n, err := strconv.Atoi(v); err == nil {
			limit = n
		}
	}
	resp, err := h.repo.AdminRecentEvents(r.Context(), limit)
	respond(w, resp, err)
}

func (r *Repo) AdminSummary(ctx context.Context) (map[string]any, error) {
	database := "UP"
	var probe int
	if err := r.pool.QueryRow(ctx, `SELECT 1`).Scan(&probe); err != nil || probe != 1 {
		database = "DOWN"
	}

	rows, err := r.pool.Query(ctx, `SELECT status, COUNT(*) AS count FROM canvas_storage_jobs GROUP BY status`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	counts := make([]map[string]any, 0)
	for rows.Next() {
		var status string
		var count int64
		if err := rows.Scan(&status, &count); err != nil {
			return nil, err
		}
		counts = append(counts, map[string]any{"status": status, "count": count})
	}
	if err := rows.Err(); err != nil {
		return nil, err
	}

	return map[string]any{
		"database": database,
		// Go 백엔드는 요청 큐 없이 동기 처리한다. 프론트 필드 계약을 위해 0으로 응답한다.
		"requestQueue":  map[string]any{"active": 0, "queued": 0, "capacity": 0, "workers": 0},
		"storageJobs":   map[string]any{"counts": counts},
		"retentionDays": 30,
		"checkedAt":     time.Now().UTC().Format(time.RFC3339),
	}, nil
}

func (r *Repo) AdminRecentEvents(ctx context.Context, limit int) ([]map[string]any, error) {
	if limit < 1 {
		limit = 1
	}
	if limit > 200 {
		limit = 200
	}
	rows, err := r.pool.Query(ctx, `
		SELECT id, request_id::text, mutation_id::text, canvas_id::text, operation_type, trigger_type,
		       priority, status, error_code, queue_ms, db_ms, r2_ms, total_ms,
		       payload_bytes, created_at
		FROM canvas_operation_events
		WHERE created_at >= NOW() - INTERVAL '30 days'
		ORDER BY created_at DESC
		LIMIT $1
	`, limit)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	fields := rows.FieldDescriptions()
	events := make([]map[string]any, 0)
	for rows.Next() {
		values, err := rows.Values()
		if err != nil {
			return nil, err
		}
		item := make(map[string]any, len(fields))
		for i, field := range fields {
			item[string(field.Name)] = values[i]
		}
		events = append(events, item)
	}
	if err := rows.Err(); err != nil {
		return nil, err
	}
	return events, nil
}

// PurgeExpiredOperationEvents는 30일이 지난 진단 이벤트를 삭제한다(Spring 보존 잡 이관).
func (r *Repo) PurgeExpiredOperationEvents(ctx context.Context) (int64, error) {
	tag, err := r.pool.Exec(ctx, `DELETE FROM canvas_operation_events WHERE created_at < NOW() - INTERVAL '30 days'`)
	if err != nil {
		return 0, err
	}
	return tag.RowsAffected(), nil
}
