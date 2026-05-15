package com.flownote.mobile;

import static org.assertj.core.api.Assertions.assertThat;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.PropertyNamingStrategies;
import org.junit.jupiter.api.Test;

import java.util.List;

class MobileConfigControllerTest {
    @Test
    void configReturnsBackendManagedMobileEndpoints() {
        MobileConfigController.MobileProperties properties = new MobileConfigController.MobileProperties(
                "http://10.0.0.2:8080",
                "http://10.0.0.2:8000",
                "http://10.0.0.2:5173",
                "1.2.3",
                List.of("webview", "auth", "tasks")
        );
        MobileConfigController controller = new MobileConfigController(properties);

        MobileConfigController.MobileConfigResponse response = controller.config();

        assertThat(response.coreApiUrl()).isEqualTo("http://10.0.0.2:8080");
        assertThat(response.aiApiUrl()).isEqualTo("http://10.0.0.2:8000");
        assertThat(response.webUrl()).isEqualTo("http://10.0.0.2:5173");
        assertThat(response.minimumSupportedVersion()).isEqualTo("1.2.3");
        assertThat(response.enabledFeatures()).containsExactly("webview", "auth", "tasks");
    }

    @Test
    void configSerializesForMobileClientContract() throws Exception {
        MobileConfigController.MobileConfigResponse response = new MobileConfigController.MobileConfigResponse(
                "http://10.0.0.2:8080",
                "http://10.0.0.2:8000",
                "http://10.0.0.2:5173",
                "1.2.3",
                List.of("webview", "auth", "tasks")
        );

        ObjectMapper objectMapper = new ObjectMapper()
                .setPropertyNamingStrategy(PropertyNamingStrategies.SNAKE_CASE);

        String json = objectMapper.writeValueAsString(response);

        assertThat(json).contains("\"core_api_url\"");
        assertThat(json).contains("\"ai_api_url\"");
        assertThat(json).contains("\"web_url\"");
        assertThat(json).contains("\"minimum_supported_version\"");
        assertThat(json).contains("\"enabled_features\"");
    }

    @Test
    void propertiesDefaultEnabledFeaturesWhenMissing() {
        MobileConfigController.MobileProperties properties = new MobileConfigController.MobileProperties(
                "http://10.0.0.2:8080",
                "http://10.0.0.2:8000",
                "http://10.0.0.2:5173",
                "1.2.3",
                null
        );

        assertThat(properties.enabledFeatures()).containsExactly("webview", "auth", "tasks", "notes", "canvas", "agent");
    }
}
