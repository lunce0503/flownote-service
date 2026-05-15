package com.flownote.mobile;

import java.util.List;

import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.boot.context.properties.EnableConfigurationProperties;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/mobile")
@EnableConfigurationProperties(MobileConfigController.MobileProperties.class)
public class MobileConfigController {
    private final MobileProperties properties;

    public MobileConfigController(MobileProperties properties) {
        this.properties = properties;
    }

    @GetMapping("/config")
    public MobileConfigResponse config() {
        return new MobileConfigResponse(
                properties.coreApiUrl(),
                properties.aiApiUrl(),
                properties.webUrl(),
                properties.minimumSupportedVersion(),
                properties.enabledFeatures());
    }

    public record MobileConfigResponse(
            String coreApiUrl,
            String aiApiUrl,
            String webUrl,
            String minimumSupportedVersion,
            List<String> enabledFeatures
    ) {
    }

    @ConfigurationProperties(prefix = "flownote.mobile")
    public record MobileProperties(
            String coreApiUrl,
            String aiApiUrl,
            String webUrl,
            String minimumSupportedVersion,
            List<String> enabledFeatures
    ) {
        public MobileProperties {
            if (enabledFeatures == null || enabledFeatures.isEmpty()) {
                enabledFeatures = List.of("webview", "auth", "tasks", "notes", "canvas", "agent");
            } else {
                enabledFeatures = List.copyOf(enabledFeatures);
            }
        }
    }
}
