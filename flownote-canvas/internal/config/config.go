package config

import (
	"fmt"
	"os"
	"strings"
)

// Config는 flownote-canvas 서버의 런타임 설정이다. 모든 값은 환경 변수에서 읽으며,
// flownote-server(Spring)와 같은 Postgres/S3 자원을 공유하도록 같은 이름 규칙을 따른다.
type Config struct {
	Port string

	// Postgres: DATABASE_URL(우선) 또는 SPRING_DATASOURCE_* 조합.
	DatabaseURL string

	// S3 호환 오브젝트 스토리지(Spring의 FLOWNOTE_STORAGE_* 와 동일 변수).
	StorageEndpoint      string
	StorageBucket        string
	StorageRegion        string
	StorageAccessKey     string
	StorageSecretKey     string
	StoragePublicBaseURL string

	// CORS 허용 오리진(쉼표 구분). 게이트웨이 뒤에 있으면 보통 비워둔다.
	CORSOrigins []string
}

// Load는 환경 변수에서 설정을 읽는다. Postgres 연결 문자열이 없으면 오류를 반환한다.
func Load() (Config, error) {
	cfg := Config{
		Port:                 firstNonEmpty(os.Getenv("PORT"), "8090"),
		DatabaseURL:          strings.TrimSpace(os.Getenv("DATABASE_URL")),
		StorageEndpoint:      strings.TrimSpace(os.Getenv("FLOWNOTE_STORAGE_ENDPOINT")),
		StorageBucket:        strings.TrimSpace(os.Getenv("FLOWNOTE_STORAGE_BUCKET")),
		StorageRegion:        firstNonEmpty(os.Getenv("FLOWNOTE_STORAGE_REGION"), "us-east-1"),
		StorageAccessKey:     strings.TrimSpace(os.Getenv("FLOWNOTE_STORAGE_ACCESS_KEY_ID")),
		StorageSecretKey:     strings.TrimSpace(os.Getenv("FLOWNOTE_STORAGE_SECRET_ACCESS_KEY")),
		StoragePublicBaseURL: strings.TrimSpace(os.Getenv("FLOWNOTE_STORAGE_PUBLIC_BASE_URL")),
	}

	if cfg.DatabaseURL == "" {
		cfg.DatabaseURL = deriveDatabaseURL()
	}
	if cfg.DatabaseURL == "" {
		return Config{}, fmt.Errorf("DATABASE_URL(또는 SPRING_DATASOURCE_*)이 필요합니다")
	}

	if origins := strings.TrimSpace(os.Getenv("CORS_ORIGINS")); origins != "" {
		for _, o := range strings.Split(origins, ",") {
			if o = strings.TrimSpace(o); o != "" {
				cfg.CORSOrigins = append(cfg.CORSOrigins, o)
			}
		}
	}
	return cfg, nil
}

// StorageConfigured는 오브젝트 스토리지 자격 증명이 모두 설정되었는지 알려준다.
// Spring과 동일하게, 미설정 시 자산 업로드/조회는 503으로 응답한다.
func (c Config) StorageConfigured() bool {
	return c.StorageEndpoint != "" && c.StorageBucket != "" && c.StorageAccessKey != "" && c.StorageSecretKey != ""
}

// deriveDatabaseURL는 Spring 스타일 JDBC 변수에서 pgx 연결 문자열을 조립한다.
// 예: SPRING_DATASOURCE_URL=jdbc:postgresql://host:5432/db
func deriveDatabaseURL() string {
	jdbc := strings.TrimSpace(os.Getenv("SPRING_DATASOURCE_URL"))
	user := strings.TrimSpace(os.Getenv("SPRING_DATASOURCE_USERNAME"))
	pass := strings.TrimSpace(os.Getenv("SPRING_DATASOURCE_PASSWORD"))
	if jdbc == "" {
		return ""
	}
	hostPart := strings.TrimPrefix(jdbc, "jdbc:postgresql://")
	if hostPart == jdbc {
		return ""
	}
	cred := ""
	if user != "" {
		cred = user
		if pass != "" {
			cred += ":" + pass
		}
		cred += "@"
	}
	return "postgres://" + cred + hostPart
}

func firstNonEmpty(values ...string) string {
	for _, v := range values {
		if strings.TrimSpace(v) != "" {
			return v
		}
	}
	return ""
}
