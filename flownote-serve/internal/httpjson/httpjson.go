package httpjson

import (
	"encoding/json"
	"net/http"
)

// APIError는 핸들러가 특정 HTTP 상태로 응답하도록 신호하는 오류 타입이다.
type APIError struct {
	Status  int
	Message string
}

func (e *APIError) Error() string { return e.Message }

// Errorf는 상태 코드와 메시지를 가진 APIError를 만든다.
func Errorf(status int, message string) *APIError {
	return &APIError{Status: status, Message: message}
}

// Write는 값을 JSON으로 직렬화해 응답한다.
func Write(w http.ResponseWriter, status int, value any) {
	w.Header().Set("Content-Type", "application/json; charset=utf-8")
	w.WriteHeader(status)
	if value == nil {
		return
	}
	_ = json.NewEncoder(w).Encode(value)
}

// WriteError는 APIError면 그 상태로, 아니면 500으로 JSON 오류를 응답한다.
// Spring 오류 본문과 유사하게 error 필드를 포함한다.
func WriteError(w http.ResponseWriter, err error) {
	status := http.StatusInternalServerError
	message := "서버 오류가 발생했습니다."
	if apiErr, ok := err.(*APIError); ok {
		status = apiErr.Status
		message = apiErr.Message
	}
	Write(w, status, map[string]any{
		"error":     message,
		"status":    status,
		"retryable": status >= 500,
	})
}
