package library

import (
	"context"
	"encoding/json"
	"io"
	"net/http"
	"strings"
	"testing"
)

func TestSuspendedDictionaryNeverCallsExternalProvider(t *testing.T) {
	prior := http.DefaultTransport
	calls := 0
	http.DefaultTransport = dictionaryTransport(func(*http.Request) (*http.Response, error) {
		calls++
		return &http.Response{StatusCode: 404, Body: io.NopCloser(strings.NewReader("{}")), Header: make(http.Header)}, nil
	})
	defer func() { http.DefaultTransport = prior }()
	for _, term := range []string{"bank", "derivative", "은행"} {
		result, err := lookupDictionary(context.Background(), term)
		if err != nil {
			t.Fatal("suspended lookup must allow word storage")
		}
		data, _ := json.Marshal(result)
		var body map[string]any
		_ = json.Unmarshal(data, &body)
		if body["status"] != "temporarily_unavailable" || result.Found || result.Definition != "" || len(result.Senses) != 0 {
			t.Fatal("suspension must be explicit and must not fabricate definitions")
		}
	}
	if calls != 0 {
		t.Fatal("a suspended dictionary contacted an external provider")
	}
}
