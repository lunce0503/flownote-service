package com.flownote.canvas;

import java.io.IOException;
import java.net.URI;
import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.util.UUID;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.web.multipart.MultipartFile;
import org.springframework.web.server.ResponseStatusException;

import software.amazon.awssdk.auth.credentials.AwsBasicCredentials;
import software.amazon.awssdk.auth.credentials.StaticCredentialsProvider;
import software.amazon.awssdk.core.ResponseBytes;
import software.amazon.awssdk.core.client.config.ClientOverrideConfiguration;
import software.amazon.awssdk.core.retry.RetryPolicy;
import software.amazon.awssdk.core.sync.RequestBody;
import software.amazon.awssdk.regions.Region;
import software.amazon.awssdk.services.s3.S3Client;
import software.amazon.awssdk.services.s3.model.DeleteObjectRequest;
import software.amazon.awssdk.services.s3.model.GetObjectRequest;
import software.amazon.awssdk.services.s3.model.GetObjectResponse;
import software.amazon.awssdk.services.s3.model.PutObjectRequest;

@Service
public class CanvasAssetStorage {
    private final S3Client s3Client;
    private final String bucket;
    private final String publicBaseUrl;

    public CanvasAssetStorage(
            @Value("${flownote.storage.endpoint}") String endpoint,
            @Value("${flownote.storage.bucket}") String bucket,
            @Value("${flownote.storage.region}") String region,
            @Value("${flownote.storage.access-key-id}") String accessKeyId,
            @Value("${flownote.storage.secret-access-key}") String secretAccessKey,
            @Value("${flownote.storage.public-base-url}") String publicBaseUrl) {
        this.bucket = bucket;
        this.publicBaseUrl = publicBaseUrl == null ? "" : publicBaseUrl.strip();
        if (isBlank(endpoint) || isBlank(bucket) || isBlank(accessKeyId) || isBlank(secretAccessKey)) {
            this.s3Client = null;
            return;
        }
        this.s3Client = S3Client.builder()
                .endpointOverride(URI.create(endpoint))
                .region(Region.of(isBlank(region) ? "us-east-1" : region))
                .credentialsProvider(StaticCredentialsProvider.create(AwsBasicCredentials.create(accessKeyId, secretAccessKey)))
                .overrideConfiguration(ClientOverrideConfiguration.builder()
                        .apiCallTimeout(Duration.ofSeconds(10))
                        .apiCallAttemptTimeout(Duration.ofSeconds(5))
                        .retryPolicy(RetryPolicy.builder().numRetries(2).build())
                        .build())
                .forcePathStyle(true)
                .build();
    }

    public StoredCanvasAsset upload(UUID userId, MultipartFile file) {
        if (s3Client == null) {
            throw new ResponseStatusException(HttpStatus.SERVICE_UNAVAILABLE, "Object storage가 설정되지 않았습니다.");
        }
        if (file == null || file.isEmpty()) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "업로드할 이미지가 필요합니다.");
        }
        String contentType = file.getContentType();
        if (isBlank(contentType) || !contentType.startsWith("image/")) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "이미지 파일만 업로드할 수 있습니다.");
        }

        String extension = extensionFor(contentType, file.getOriginalFilename());
        String objectKey = "canvas/%s/%s%s".formatted(userId, UUID.randomUUID(), extension);
        try {
            putObject(objectKey, file.getBytes(), contentType);
            return new StoredCanvasAsset(objectKey, contentType, file.getSize(), publicUrl(objectKey));
        } catch (IOException exception) {
            throw new ResponseStatusException(HttpStatus.INTERNAL_SERVER_ERROR, "이미지를 읽을 수 없습니다.", exception);
        } catch (RuntimeException exception) {
            throw new ResponseStatusException(HttpStatus.BAD_GATEWAY, "Object storage 업로드에 실패했습니다.", exception);
        }
    }

    public StoredCanvasAsset putJson(String objectKey, String json) {
        byte[] bytes = json.getBytes(StandardCharsets.UTF_8);
        putObject(objectKey, bytes, "application/json");
        return new StoredCanvasAsset(objectKey, "application/json", bytes.length, publicUrl(objectKey));
    }

    public StoredCanvasAsset putText(String objectKey, String text) {
        byte[] bytes = (text == null ? "" : text).getBytes(StandardCharsets.UTF_8);
        putObject(objectKey, bytes, "text/plain; charset=utf-8");
        return new StoredCanvasAsset(objectKey, "text/plain; charset=utf-8", bytes.length, publicUrl(objectKey));
    }

    public String readJson(String objectKey) {
        return new String(readObjectBytes(objectKey), StandardCharsets.UTF_8);
    }

    public String readText(String objectKey) {
        return new String(readObjectBytes(objectKey), StandardCharsets.UTF_8);
    }

    public String publicUrlFor(String objectKey) {
        return publicUrl(objectKey);
    }

    public ResponseBytes<GetObjectResponse> read(String objectKey) {
        return getObjectBytes(objectKey);
    }

    public byte[] readObjectBytes(String objectKey) {
        return getObjectBytes(objectKey).asByteArray();
    }

    public void verifyReadWrite() {
        String objectKey = "healthcheck/%s.txt".formatted(UUID.randomUUID());
        byte[] expected = "ok".getBytes(StandardCharsets.UTF_8);
        putObject(objectKey, expected, "text/plain");
        try {
            byte[] actual = readObjectBytes(objectKey);
            if (!java.util.Arrays.equals(expected, actual)) {
                throw new IllegalStateException("Object storage read/write verification returned unexpected content.");
            }
        } finally {
            deleteObject(objectKey);
        }
    }

    public void delete(String objectKey) {
        if (isBlank(objectKey)) {
            return;
        }
        deleteObject(objectKey);
    }

    private void putObject(String objectKey, byte[] bytes, String contentType) {
        if (s3Client == null) {
            throw new ResponseStatusException(HttpStatus.SERVICE_UNAVAILABLE, "Object storage가 설정되지 않았습니다.");
        }
        try {
            s3Client.putObject(
                    PutObjectRequest.builder()
                            .bucket(bucket)
                            .key(objectKey)
                            .contentType(contentType)
                            .contentLength((long) bytes.length)
                            .build(),
                    RequestBody.fromBytes(bytes));
        } catch (RuntimeException exception) {
            throw new ResponseStatusException(HttpStatus.BAD_GATEWAY, "Object storage 저장에 실패했습니다.", exception);
        }
    }

    private void deleteObject(String objectKey) {
        if (s3Client == null) {
            return;
        }
        s3Client.deleteObject(DeleteObjectRequest.builder()
                .bucket(bucket)
                .key(objectKey)
                .build());
    }

    private ResponseBytes<GetObjectResponse> getObjectBytes(String objectKey) {
        if (s3Client == null) {
            throw new ResponseStatusException(HttpStatus.SERVICE_UNAVAILABLE, "Object storage가 설정되지 않았습니다.");
        }
        try {
            return s3Client.getObjectAsBytes(GetObjectRequest.builder()
                    .bucket(bucket)
                    .key(objectKey)
                    .build());
        } catch (RuntimeException exception) {
            throw new ResponseStatusException(HttpStatus.NOT_FOUND, "이미지를 찾을 수 없습니다.", exception);
        }
    }

    private String publicUrl(String objectKey) {
        if (publicBaseUrl.isBlank()) {
            return "";
        }
        return publicBaseUrl.replaceAll("/+$", "") + "/" + objectKey;
    }

    private String extensionFor(String contentType, String filename) {
        String safeFilename = filename == null ? "" : filename.toLowerCase();
        int dot = safeFilename.lastIndexOf('.');
        if (dot >= 0 && dot < safeFilename.length() - 1 && safeFilename.substring(dot).matches("\\.[a-z0-9]{1,8}")) {
            return safeFilename.substring(dot);
        }
        return switch (contentType) {
            case "image/jpeg" -> ".jpg";
            case "image/png" -> ".png";
            case "image/gif" -> ".gif";
            case "image/webp" -> ".webp";
            case "image/svg+xml" -> ".svg";
            default -> "";
        };
    }

    private boolean isBlank(String value) {
        return value == null || value.isBlank();
    }

    public record StoredCanvasAsset(String objectKey, String contentType, long byteSize, String publicUrl) {
    }
}
