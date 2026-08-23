package auth

import (
	"net/http"
	"testing"

	"github.com/flownote/flownote-serve/internal/httpjson"
)

func TestParseBearer(t *testing.T) {
	token := "4b04f5d0-b8d3-4fd5-a79f-a53fa4cdd5b6"
	got, err := parseBearer("Bearer " + token)
	if err != nil || got != token {
		t.Fatalf("parseBearer() = %q, %v; want %q, nil", got, err, token)
	}
}

func TestParseBearerRejectsMalformedHeaders(t *testing.T) {
	for _, header := range []string{"", "Basic abc", "Bearer not-a-uuid"} {
		_, err := parseBearer(header)
		apiErr, ok := err.(*httpjson.APIError)
		if !ok || apiErr.Status != http.StatusUnauthorized {
			t.Errorf("parseBearer(%q) error = %#v; want 401 APIError", header, err)
		}
	}
}
