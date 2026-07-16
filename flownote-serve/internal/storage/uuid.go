package storage

import (
	"crypto/rand"
	"fmt"
	"os"
)

// NewUUID는 crypto/rand 기반 UUIDv4 문자열을 만든다(외부 의존성 회피, 도메인 공용).
func NewUUID() string {
	var u [16]byte
	if _, err := rand.Read(u[:]); err != nil {
		return fmt.Sprintf("%d", os.Getpid())
	}
	u[6] = (u[6] & 0x0f) | 0x40
	u[8] = (u[8] & 0x3f) | 0x80
	return fmt.Sprintf("%x-%x-%x-%x-%x", u[0:4], u[4:6], u[6:8], u[8:10], u[10:16])
}
