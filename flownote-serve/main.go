package main

import (
	"context"
	"log"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/flownote/flownote-serve/internal/auth"
	"github.com/flownote/flownote-serve/internal/chat"
	"github.com/flownote/flownote-serve/internal/config"
	"github.com/flownote/flownote-serve/internal/schedule"
	"github.com/flownote/flownote-serve/internal/social"
	"github.com/flownote/flownote-serve/internal/stocks"
	"github.com/flownote/flownote-serve/internal/storage"
	"github.com/flownote/flownote-serve/internal/task"
)

// flownote-serve: 부가기능(일정·작업·주식·소셜·채팅) 백엔드.
// flownote-server(Spring)에서 이관했으며 게이트웨이 뒤에서 요청 시에만 깨어난다(서버리스).
func main() {
	cfg, err := config.Load()
	if err != nil {
		log.Fatalf("config: %v", err)
	}

	ctx := context.Background()
	pool, err := pgxpool.New(ctx, cfg.DatabaseURL)
	if err != nil {
		log.Fatalf("db pool: %v", err)
	}
	defer pool.Close()

	pingCtx, cancel := context.WithTimeout(ctx, 10*time.Second)
	defer cancel()
	if err := pool.Ping(pingCtx); err != nil {
		log.Fatalf("db ping: %v", err)
	}

	store, err := storage.New(ctx, cfg)
	if err != nil {
		log.Fatalf("storage: %v", err)
	}
	if !store.Configured() {
		log.Printf("경고: 오브젝트 스토리지 미설정 — 메모/메시지 본문 오프로드가 503으로 응답합니다.")
	}

	authenticator := auth.New(pool)

	mux := http.NewServeMux()
	mux.HandleFunc("GET /", func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusOK)
		_, _ = w.Write([]byte(`{"status":"UP","service":"flownote-serve"}`))
	})
	mux.HandleFunc("GET /health", func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusOK)
		_, _ = w.Write([]byte("ok"))
	})

	schedule.NewHandler(schedule.NewRepo(pool, store), authenticator).Register(mux)
	task.NewHandler(task.NewRepo(pool, store), authenticator).Register(mux)
	stocks.NewHandler(stocks.NewRepo(pool), stocks.NewMarketClient(cfg.MarketDataURL), authenticator).Register(mux)
	social.NewHandler(social.NewRepo(pool, store), authenticator).Register(mux)
	chat.NewHandler(chat.NewRepo(pool, store), authenticator).Register(mux)

	root := withCORS(cfg.CORSOrigins, withRequestLog(mux))

	srv := &http.Server{
		Addr:              ":" + cfg.Port,
		Handler:           root,
		ReadHeaderTimeout: 10 * time.Second,
	}

	go func() {
		log.Printf("flownote-serve listening on :%s", cfg.Port)
		if err := srv.ListenAndServe(); err != nil && err != http.ErrServerClosed {
			log.Fatalf("server: %v", err)
		}
	}()

	stop := make(chan os.Signal, 1)
	signal.Notify(stop, syscall.SIGINT, syscall.SIGTERM)
	<-stop
	shutdownCtx, shutdownCancel := context.WithTimeout(context.Background(), 15*time.Second)
	defer shutdownCancel()
	_ = srv.Shutdown(shutdownCtx)
	log.Printf("flownote-serve stopped")
}

// withRequestLog는 헬스체크를 제외한 모든 요청을 상태 코드·지연 시간과 함께 기록한다.
func withRequestLog(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path == "/" || r.URL.Path == "/health" {
			next.ServeHTTP(w, r)
			return
		}
		started := time.Now()
		rec := &statusRecorder{ResponseWriter: w, status: http.StatusOK}
		next.ServeHTTP(rec, r)
		elapsed := time.Since(started)
		slow := ""
		if elapsed > 2*time.Second {
			slow = " SLOW"
		}
		pathWithQuery := r.URL.Path
		if r.URL.RawQuery != "" {
			pathWithQuery += "?" + r.URL.RawQuery
		}
		log.Printf("%s %s -> %d %dms%s", r.Method, pathWithQuery, rec.status, elapsed.Milliseconds(), slow)
	})
}

type statusRecorder struct {
	http.ResponseWriter
	status int
}

func (s *statusRecorder) WriteHeader(code int) {
	s.status = code
	s.ResponseWriter.WriteHeader(code)
}

// Flush는 SSE(주식 스트림)를 위해 래핑을 관통시킨다.
func (s *statusRecorder) Flush() {
	if f, ok := s.ResponseWriter.(http.Flusher); ok {
		f.Flush()
	}
}

// withCORS는 필요 시 CORS 헤더를 붙인다. 게이트웨이 뒤에서는 보통 CORS_ORIGINS를 비워둔다.
func withCORS(origins []string, next http.Handler) http.Handler {
	allowed := map[string]bool{}
	for _, o := range origins {
		allowed[o] = true
	}
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		origin := r.Header.Get("Origin")
		if origin != "" && (allowed["*"] || allowed[origin]) {
			w.Header().Set("Access-Control-Allow-Origin", origin)
			w.Header().Set("Vary", "Origin")
			w.Header().Set("Access-Control-Allow-Credentials", "true")
			w.Header().Set("Access-Control-Allow-Headers", "Authorization, Content-Type")
			w.Header().Set("Access-Control-Allow-Methods", "GET, POST, PUT, PATCH, DELETE, OPTIONS")
		}
		if r.Method == http.MethodOptions {
			w.WriteHeader(http.StatusNoContent)
			return
		}
		next.ServeHTTP(w, r)
	})
}
