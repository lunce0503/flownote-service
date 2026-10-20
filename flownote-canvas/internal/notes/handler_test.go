package notes

import (
	"context"
	"errors"
	"github.com/flownote/flownote-canvas/internal/auth"
	"github.com/jackc/pgx/v5"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"
)

func TestNewRoutesStillRequireAuthentication(t *testing.T) {
	mux := http.NewServeMux()
	NewHandler(nil, auth.New(nil), t.TempDir()).Register(mux)
	for _, url := range []string{"/api/notes?view=summary", "/api/notes/00000000-0000-0000-0000-000000000001"} {
		req := httptest.NewRequest("GET", url, nil)
		w := httptest.NewRecorder()
		mux.ServeHTTP(w, req)
		if w.Code != 401 {
			t.Fatalf("unauthenticated %s: %d", url, w.Code)
		}
	}
}
func TestQueryHTTPContracts(t *testing.T) {
	h := &Handler{repo: &Repo{}}
	for _, query := range []string{"view=other", "view=summary&limit=0", "view=summary&limit=101", "view=summary&limit=bad", "view=summary&cursor=bad"} {
		w := httptest.NewRecorder()
		h.list(w, httptest.NewRequest("GET", "/api/notes?"+query, nil))
		if w.Code != 400 {
			t.Fatalf("invalid query %s: %d", query, w.Code)
		}
	}
	for _, raw := range []string{`{"id":"00000000-0000-0000-0000-000000000001","title":"x","content":{},"revision":1,"client_id":"c"}`, `{}`} {
		w := httptest.NewRecorder()
		h.upsert(w, httptest.NewRequest("POST", "/api/notes", strings.NewReader(raw)))
		if w.Code != 400 {
			t.Fatalf("invalid upsert: %d", w.Code)
		}
	}
	store := &countingStore{fail: true}
	h.repo = &Repo{store: store, queryRow: func(_ context.Context, _ string, args ...any) pgx.Row {
		if args[0] == "00000000-0000-0000-0000-000000000001" {
			return testRow{err: pgx.ErrNoRows}
		}
		if args[0] == "00000000-0000-0000-0000-000000000002" {
			return testRow{values: []any{args[0], "bad", "[]", "body", time.Now(), time.Now(), int64(1), "client"}}
		}
		return testRow{err: errors.New("database failed")}
	}}
	for id, status := range map[string]int{"invalid": 400, "00000000-0000-0000-0000-000000000001": 404, "00000000-0000-0000-0000-000000000002": 502, "00000000-0000-0000-0000-000000000003": 500} {
		req := httptest.NewRequest("GET", "/api/notes/"+id, nil)
		req.SetPathValue("noteId", id)
		w := httptest.NewRecorder()
		h.get(w, req)
		if w.Code != status {
			t.Fatalf("detail %s: %d, want %d", id, w.Code, status)
		}
	}
}
