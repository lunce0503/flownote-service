package main

import (
	"context"
	"log"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"

	"github.com/flownote/flownote-canvas/internal/auth"
	"github.com/flownote/flownote-canvas/internal/canvas"
	"github.com/flownote/flownote-canvas/internal/config"
	"github.com/flownote/flownote-canvas/internal/storage"
	"github.com/jackc/pgx/v5/pgxpool"
)

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
		log.Printf("경고: 오브젝트 스토리지 미설정 — 자산 업로드/조회는 503으로 응답합니다.")
	}

	authenticator := auth.New(pool)
	repo := canvas.NewRepo(pool, store)
	handler := canvas.NewHandler(repo, store, authenticator)

	mux := http.NewServeMux()
	// Railway health check.
	mux.HandleFunc("GET /", func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusOK)
		_, _ = w.Write([]byte(`{"status":"UP","service":"flownote-canvas"}`))
	})
	mux.HandleFunc("GET /health", func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusOK)
		_, _ = w.Write([]byte("ok"))
	})
	handler.Register(mux)
	handler.RegisterAdmin(mux)

	// Spring의 진단 이벤트 보존 잡(매일, 30일 초과 삭제)을 이관했다.
	go func() {
		for {
			purgeCtx, purgeCancel := context.WithTimeout(ctx, time.Minute)
			if deleted, err := repo.PurgeExpiredOperationEvents(purgeCtx); err != nil {
				log.Printf("retention: canvas_operation_events 정리 실패: %v", err)
			} else if deleted > 0 {
				log.Printf("retention: canvas_operation_events %d건 정리", deleted)
			}
			purgeCancel()
			time.Sleep(24 * time.Hour)
		}
	}()

	root := withCORS(cfg.CORSOrigins, withRequestLog(mux))

	srv := &http.Server{
		Addr:              ":" + cfg.Port,
		Handler:           root,
		ReadHeaderTimeout: 10 * time.Second,
	}

	go func() {
		log.Printf("flownote-canvas listening on :%s", cfg.Port)
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
	log.Printf("flownote-canvas stopped")
}

// withRequestLog는 헬스체크를 제외한 모든 요청을 상태 코드·지연 시간과 함께 기록한다.
// 2초 초과 요청에는 SLOW 표시를 붙여 저장 지연 같은 문제를 로그에서 바로 찾을 수 있게 한다.
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
