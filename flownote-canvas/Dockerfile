# syntax=docker/dockerfile:1

# --- build stage ---
FROM golang:1.23-alpine AS build
WORKDIR /src

# 소스 전체를 복사한 뒤 컨테이너 안에서 의존성을 해석한다(go.sum을 사전 생성하지 않아도 됨).
COPY . .
RUN go mod tidy
RUN CGO_ENABLED=0 GOOS=linux go build -ldflags="-s -w" -o /out/flownote-canvas .

# --- runtime stage ---
FROM alpine:3.20
RUN apk add --no-cache ca-certificates && adduser -D -u 10001 app
USER app
WORKDIR /app
COPY --from=build /out/flownote-canvas /app/flownote-canvas
ENV PORT=8090
EXPOSE 8090
ENTRYPOINT ["/app/flownote-canvas"]
