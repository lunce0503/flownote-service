package auth

import (
	"context"
	"errors"
	"net/http"
	"os"
	"strings"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/redis/go-redis/v9"

	"github.com/flownote/flownote-serve/internal/httpjson"
)

type ctxKey int

const userIDKey ctxKey = iota

// 세션 캐시 TTL. 로그아웃 엔드포인트가 없어 세션은 expires_at으로만 끝나므로
// 만료 직후 최대 이 시간만큼의 오차를 허용한다(모든 요청의 DB 왕복 제거가 목적).
const sessionCacheTTL = 5 * time.Minute

// Authenticator는 Spring의 AuthService와 동일하게 app_sessions 테이블을 조회해
// Bearer 토큰(UUID)을 사용자 UUID로 해석한다. REDIS_URL이 설정되면 토큰→사용자를
// Redis에 캐시해 서비스 공통의 세션 DB 조회를 줄인다.
type Authenticator struct {
	pool  *pgxpool.Pool
	cache *redis.Client
}

func New(pool *pgxpool.Pool) *Authenticator {
	a := &Authenticator{pool: pool}
	if redisURL := strings.TrimSpace(os.Getenv("REDIS_URL")); redisURL != "" {
		if opts, err := redis.ParseURL(redisURL); err == nil {
			opts.DialTimeout = 2 * time.Second
			opts.ReadTimeout = 500 * time.Millisecond
			opts.WriteTimeout = 500 * time.Millisecond
			a.cache = redis.NewClient(opts)
		}
	}
	return a
}

// lookupSession은 토큰을 (userID, role)로 해석한다. Redis 캐시 우선, 실패는 조용히 DB 폴백.
func (a *Authenticator) lookupSession(ctx context.Context, token string) (string, string, error) {
	cacheKey := "session:" + token
	if a.cache != nil {
		if cached, err := a.cache.Get(ctx, cacheKey).Result(); err == nil {
			if userID, role, ok := strings.Cut(cached, "|"); ok {
				return userID, role, nil
			}
		}
	}

	var userID, role string
	err := a.pool.QueryRow(ctx, `
		SELECT s.user_id::text, COALESCE(u.role, 'USER')
		FROM app_sessions s
		JOIN users u ON u.id = s.user_id
		WHERE s.token = $1 AND s.expires_at > NOW()
	`, token).Scan(&userID, &role)
	if errors.Is(err, pgx.ErrNoRows) {
		return "", "", httpjson.Errorf(http.StatusUnauthorized, "로그인이 필요합니다.")
	}
	if err != nil {
		return "", "", err
	}
	if a.cache != nil {
		_ = a.cache.Set(ctx, cacheKey, userID+"|"+role, sessionCacheTTL).Err()
	}
	return userID, role, nil
}

// RequireUser는 Authorization 헤더에서 사용자 UUID를 해석한다. 실패 시 401 APIError.
func (a *Authenticator) RequireUser(ctx context.Context, authorization string) (string, error) {
	token, err := parseBearer(authorization)
	if err != nil {
		return "", err
	}
	userID, _, err := a.lookupSession(ctx, token)
	return userID, err
}

// RequireAdmin은 사용자를 해석하고 ADMIN 역할까지 확인한다(Spring requireAdmin과 동일 규칙).
func (a *Authenticator) RequireAdmin(ctx context.Context, authorization string) (string, error) {
	token, err := parseBearer(authorization)
	if err != nil {
		return "", err
	}
	userID, role, err := a.lookupSession(ctx, token)
	if err != nil {
		return "", err
	}
	if role != "ADMIN" {
		return "", httpjson.Errorf(http.StatusForbidden, "관리자 권한이 필요합니다.")
	}
	return userID, nil
}

// AdminMiddleware는 관리자 전용 라우트를 인증한다.
func (a *Authenticator) AdminMiddleware(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		userID, err := a.RequireAdmin(r.Context(), r.Header.Get("Authorization"))
		if err != nil {
			httpjson.WriteError(w, err)
			return
		}
		ctx := context.WithValue(r.Context(), userIDKey, userID)
		next.ServeHTTP(w, r.WithContext(ctx))
	})
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
