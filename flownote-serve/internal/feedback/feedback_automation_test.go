package feedback

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"
)

func TestAutomationFeedRejectsMissingToken(t *testing.T) {
	h := &Handler{
		automationToken: "expected-token",
		automationList: func(context.Context, int64, int) ([]AutomationFeedback, error) {
			t.Fatal("repository must not be called for an unauthorized request")
			return nil, nil
		},
	}

	req := httptest.NewRequest(http.MethodGet, "/api/feedback/automation?after=0", nil)
	rec := httptest.NewRecorder()
	h.listAutomation(rec, req)

	if rec.Code != http.StatusUnauthorized {
		t.Fatalf("status = %d; want %d", rec.Code, http.StatusUnauthorized)
	}
}

func TestAutomationFeedReturnsSanitizedItemsAndCursor(t *testing.T) {
	h := &Handler{
		automationToken: "expected-token",
		automationList: func(_ context.Context, after int64, limit int) ([]AutomationFeedback, error) {
			if after != 7 || limit != 50 {
				t.Fatalf("query = after %d limit %d; want after 7 limit 50", after, limit)
			}
			return []AutomationFeedback{{
				Sequence:  8,
				ID:        "11111111-1111-1111-1111-111111111111",
				Category:  "버그",
				Message:   "캔버스 저장이 느립니다.",
				CreatedAt: time.Date(2026, 10, 3, 1, 2, 3, 0, time.UTC),
			}}, nil
		},
	}

	req := httptest.NewRequest(http.MethodGet, "/api/feedback/automation?after=7", nil)
	req.Header.Set("Authorization", "Bearer expected-token")
	rec := httptest.NewRecorder()
	h.listAutomation(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("status = %d body=%s; want 200", rec.Code, rec.Body.String())
	}
	var body struct {
		Items      []AutomationFeedback `json:"items"`
		NextCursor int64                `json:"next_cursor"`
	}
	raw := append([]byte(nil), rec.Body.Bytes()...)
	if err := json.Unmarshal(raw, &body); err != nil {
		t.Fatal(err)
	}
	if len(body.Items) != 1 || body.NextCursor != 8 {
		t.Fatalf("body = %#v; want one item and cursor 8", body)
	}
	serialized := string(raw)
	if strings.Contains(serialized, "contact") || strings.Contains(serialized, "user_id") {
		t.Fatalf("automation response leaked private fields: %s", serialized)
	}
}

func TestAutomationFeedBootstrapsWithoutReturningExistingFeedback(t *testing.T) {
	h := &Handler{
		automationToken:  "expected-token",
		automationCursor: func(context.Context) (int64, error) { return 42, nil },
	}

	req := httptest.NewRequest(http.MethodGet, "/api/feedback/automation", nil)
	req.Header.Set("Authorization", "Bearer expected-token")
	rec := httptest.NewRecorder()
	h.listAutomation(rec, req)

	if rec.Code != http.StatusOK || !strings.Contains(rec.Body.String(), `"next_cursor":42`) || !strings.Contains(rec.Body.String(), `"items":[]`) {
		t.Fatalf("bootstrap response = status %d body %s", rec.Code, rec.Body.String())
	}
}
