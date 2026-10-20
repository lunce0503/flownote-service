package auth

import (
	"context"
	"net/http"
	"strings"
	"testing"

	"github.com/flownote/flownote-canvas/internal/httpjson"
	"github.com/jackc/pgx/v5"
)

type sessionRow struct {
	user, role string
	err        error
}

func (r sessionRow) Scan(values ...any) error {
	if r.err != nil {
		return r.err
	}
	*values[0].(*string) = r.user
	*values[1].(*string) = r.role
	return nil
}

type sessionStore struct {
	row     sessionRow
	queries int
}

func (s *sessionStore) QueryRow(_ context.Context, query string, _ ...any) pgx.Row {
	if !strings.Contains(query, "s.expires_at > NOW()") || !strings.Contains(query, "JOIN users") {
		panic("Authentication must check current expiry and role")
	}
	s.queries++
	return s.row
}

func TestRevocationExpiryAndRoleChangesAreNotCached(t *testing.T) {
	token := "4b04f5d0-b8d3-4fd5-a79f-a53fa4cdd5b6"
	store := &sessionStore{row: sessionRow{user: token, role: "ADMIN"}}
	a := &Authenticator{pool: store}
	if _, err := a.RequireAdmin(context.Background(), "Bearer "+token); err != nil {
		t.Fatal(err)
	}
	store.row.role = "USER"
	if _, err := a.RequireAdmin(context.Background(), "Bearer "+token); err == nil {
		t.Fatal("demoted administrator was accepted")
	}
	store.row.err = pgx.ErrNoRows
	_, err := a.RequireUser(context.Background(), "Bearer "+token)
	apiErr, ok := err.(*httpjson.APIError)
	if !ok || apiErr.Status != http.StatusUnauthorized {
		t.Fatalf("revoked/expired session = %v", err)
	}
	if store.queries != 3 {
		t.Fatalf("queries = %d, expected every request", store.queries)
	}
}
