package storage

import (
	"bytes"
	"context"
	"errors"
	"io"
	"net/http"
	"strings"
	"time"

	"github.com/aws/aws-sdk-go-v2/aws"
	awsconfig "github.com/aws/aws-sdk-go-v2/config"
	"github.com/aws/aws-sdk-go-v2/credentials"
	"github.com/aws/aws-sdk-go-v2/service/s3"
	"github.com/flownote/flownote-canvas/internal/config"
	"github.com/flownote/flownote-canvas/internal/httpjson"
)

// Store는 S3 호환 오브젝트 스토리지에 캔버스 자산(이미지)을 저장/조회한다.
// Spring의 CanvasAssetStorage와 같은 버킷/키 규칙(forcePathStyle)을 따른다.
type Store struct {
	client         *s3.Client
	bucket         string
	publicBaseURL  string
	configured     bool
}

// Object는 스토리지에서 읽은 바이트와 메타데이터다.
type Object struct {
	ContentType string
	ByteSize    int64
	Data        []byte
}

// New는 설정이 완비된 경우에만 S3 클라이언트를 만든다. 미설정이면 configured=false.
func New(ctx context.Context, cfg config.Config) (*Store, error) {
	if !cfg.StorageConfigured() {
		return &Store{configured: false}, nil
	}
	awsCfg, err := awsconfig.LoadDefaultConfig(ctx,
		awsconfig.WithRegion(cfg.StorageRegion),
		awsconfig.WithCredentialsProvider(credentials.NewStaticCredentialsProvider(cfg.StorageAccessKey, cfg.StorageSecretKey, "")),
	)
	if err != nil {
		return nil, err
	}
	client := s3.NewFromConfig(awsCfg, func(o *s3.Options) {
		o.BaseEndpoint = aws.String(cfg.StorageEndpoint)
		o.UsePathStyle = true
	})
	return &Store{
		client:        client,
		bucket:        cfg.StorageBucket,
		publicBaseURL: strings.TrimRight(cfg.StoragePublicBaseURL, "/"),
		configured:    true,
	}, nil
}

func (s *Store) Configured() bool { return s.configured }

var errNotConfigured = httpjson.Errorf(http.StatusServiceUnavailable, "Object storage가 설정되지 않았습니다.")

// Put는 바이트를 지정 키로 업로드하고 공개 URL을 돌려준다.
func (s *Store) Put(ctx context.Context, objectKey, contentType string, data []byte) (string, error) {
	if !s.configured {
		return "", errNotConfigured
	}
	putCtx, cancel := context.WithTimeout(ctx, 10*time.Second)
	defer cancel()
	_, err := s.client.PutObject(putCtx, &s3.PutObjectInput{
		Bucket:      aws.String(s.bucket),
		Key:         aws.String(objectKey),
		Body:        bytes.NewReader(data),
		ContentType: aws.String(contentType),
	})
	if err != nil {
		return "", httpjson.Errorf(http.StatusBadGateway, "Object storage 업로드에 실패했습니다.")
	}
	return s.PublicURL(objectKey), nil
}

// Get은 키로 오브젝트를 읽는다.
func (s *Store) Get(ctx context.Context, objectKey string) (*Object, error) {
	if !s.configured {
		return nil, errNotConfigured
	}
	getCtx, cancel := context.WithTimeout(ctx, 10*time.Second)
	defer cancel()
	out, err := s.client.GetObject(getCtx, &s3.GetObjectInput{
		Bucket: aws.String(s.bucket),
		Key:    aws.String(objectKey),
	})
	if err != nil {
		return nil, httpjson.Errorf(http.StatusNotFound, "이미지를 찾을 수 없습니다.")
	}
	defer out.Body.Close()
	data, err := io.ReadAll(out.Body)
	if err != nil {
		return nil, errors.New("object read failed")
	}
	contentType := ""
	if out.ContentType != nil {
		contentType = *out.ContentType
	}
	size := int64(len(data))
	if out.ContentLength != nil && *out.ContentLength >= 0 {
		size = *out.ContentLength
	}
	return &Object{ContentType: contentType, ByteSize: size, Data: data}, nil
}

// PublicURL은 공개 베이스가 설정된 경우 직접 URL을, 아니면 빈 문자열을 준다.
func (s *Store) PublicURL(objectKey string) string {
	if s.publicBaseURL == "" {
		return ""
	}
	return s.publicBaseURL + "/" + objectKey
}
