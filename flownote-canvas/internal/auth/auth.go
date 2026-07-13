package auth

import (
	"context"
	"errors"
	"net/http"
	"strings"

	"github.com/flownote/flownote-canvas/internal/httpjson"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

type ctxKey int

const userIDKey ctxKey = iota

// Authenticator는 Spring의 AuthService와 동일하게 app_sessions 테이블을 조회해
// Bearer 토큰(UUID)을 사용자 UUID로 해석한다. 세션 저장소를 flownote-server와 공유한다.
type Authenticator struct {
	pool *pgxpool.Pool
}

func New(pool *pgxpool.Pool) *Authenticator {
	return &Authenticator{pool: pool}
}

// RequireUser는 Authorization 헤더에서 사용자 UUID를 해석한다. 실패 시 401 APIError.
func (a *Authenticator) RequireUser(ctx context.Context, authorization string) (string, error) {
	token, err := parseBearer(authorization)
	if err != nil {
		return "", err
	}
	var userID string
	err = a.pool.QueryRow(ctx, `
		SELECT s.user_id::text
		FROM app_sessions s
		JOIN users u ON u.id = s.user_id
		WHERE s.token = $1 AND s.expires_at > NOW()
	`, token).Scan(&userID)
	if errors.Is(err, pgx.ErrNoRows) {
		return "", httpjson.Errorf(http.StatusUnauthorized, "로그인이 필요합니다.")
	}
	if err != nil {
		return "", err
	}
	return userID, nil
}

// Middleware는 요청을 인증하고 사용자 UUID를 컨텍스트에 담는다.
func (a *Authenticator) Middleware(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		userID, err := a.RequireUser(r.Context(), r.Header.Get("Authorization"))
		if err != nil {
			httpjson.WriteError(w, err)
			return
		}
		ctx := context.WithValue(r.Context(), userIDKey, userID)
		next.ServeHTTP(w, r.WithContext(ctx))
	})
}

// UserID는 인증 미들웨어가 담아둔 사용자 UUID를 꺼낸다.
func UserID(ctx context.Context) string {
	if v, ok := ctx.Value(userIDKey).(string); ok {
		return v
	}
	return ""
}

func parseBearer(authorization string) (string, error) {
	if !strings.HasPrefix(authorization, "Bearer ") {
		return "", httpjson.Errorf(http.StatusUnauthorized, "로그인이 필요합니다.")
	}
	token := strings.TrimSpace(strings.TrimPrefix(authorization, "Bearer "))
	if !isUUID(token) {
		return "", httpjson.Errorf(http.StatusUnauthorized, "로그인이 필요합니다.")
	}
	return token, nil
}

// isUUID는 8-4-4-4-12 형태의 UUID 문자열인지 가볍게 검사한다.
func isUUID(s string) bool {
	if len(s) != 36 {
		return false
	}
	for i, c := range s {
		switch i {
		case 8, 13, 18, 23:
			if c != '-' {
				return false
			}
		default:
			if !((c >= '0' && c <= '9') || (c >= 'a' && c <= 'f') || (c >= 'A' && c <= 'F')) {
				return false
			}
		}
	}
	return true
}
