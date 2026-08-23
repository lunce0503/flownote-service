package httpjson

import (
	"encoding/json"
	"errors"
	"net/http"
	"net/http/httptest"
	"testing"
)

func TestWriteErrorMarksOnlyServerErrorsRetryable(t *testing.T) {
	tests := []struct {
		name      string
		err       error
		status    int
		retryable bool
	}{
		{name: "client error", err: Errorf(http.StatusBadRequest, "bad request"), status: http.StatusBadRequest, retryable: false},
		{name: "unknown error", err: errors.New("db unavailable"), status: http.StatusInternalServerError, retryable: true},
	}

	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			recorder := httptest.NewRecorder()
			WriteError(recorder, test.err)
			var body struct {
				Status    int  `json:"status"`
				Retryable bool `json:"retryable"`
			}
			if err := json.NewDecoder(recorder.Body).Decode(&body); err != nil {
				t.Fatal(err)
			}
			if recorder.Code != test.status || body.Status != test.status || body.Retryable != test.retryable {
				t.Fatalf("response = status %d body %#v", recorder.Code, body)
			}
		})
	}
}
