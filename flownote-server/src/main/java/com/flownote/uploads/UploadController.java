package com.flownote.uploads;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.Map;
import java.util.UUID;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestPart;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.multipart.MultipartFile;
import org.springframework.web.server.ResponseStatusException;

import com.flownote.auth.AuthService;

@RestController
@RequestMapping("/api")
public class UploadController {
    private final AuthService authService;
    private final Path uploadDir;

    public UploadController(AuthService authService, @Value("${flownote.upload.dir:${user.dir}/uploads}") String uploadDir) {
        this.authService = authService;
        this.uploadDir = Path.of(uploadDir);
    }

    @PostMapping({"/upload", "/notes/upload"})
    public Map<String, String> upload(
            @RequestHeader(value = "Authorization", required = false) String authorization,
            @RequestPart(value = "image", required = false) MultipartFile image,
            @RequestPart(value = "file", required = false) MultipartFile file) {
        authService.requireUserId(authorization);
        MultipartFile upload = image != null ? image : file;
        if (upload == null || upload.isEmpty()) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "업로드할 파일이 필요합니다.");
        }
        try {
            Files.createDirectories(uploadDir);
            String safeName = sanitize(upload.getOriginalFilename());
            String filename = UUID.randomUUID() + "-" + safeName;
            upload.transferTo(uploadDir.resolve(filename));
            return Map.of(
                    "filename", filename,
                    "fileUrl", "/uploads/" + filename);
        } catch (IOException exception) {
            throw new ResponseStatusException(HttpStatus.INTERNAL_SERVER_ERROR, "파일 업로드에 실패했습니다.", exception);
        }
    }

    private String sanitize(String filename) {
        String baseName = filename == null || filename.isBlank() ? "file" : Path.of(filename.replace("\\", "/")).getFileName().toString();
        return baseName.chars()
                .mapToObj(ch -> Character.isLetterOrDigit(ch) || ch == '.' || ch == '_' || ch == '-' ? String.valueOf((char) ch) : "_")
                .reduce("", String::concat);
    }
}
