package com.flownote.storage;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.ApplicationArguments;
import org.springframework.boot.ApplicationRunner;
import org.springframework.stereotype.Component;

@Component
public class CanvasAssetStorageStartupValidator implements ApplicationRunner {
    private final CanvasAssetStorage assetStorage;
    private final boolean validateOnStartup;

    public CanvasAssetStorageStartupValidator(
            CanvasAssetStorage assetStorage,
            @Value("${flownote.storage.validate-on-startup:false}") boolean validateOnStartup) {
        this.assetStorage = assetStorage;
        this.validateOnStartup = validateOnStartup;
    }

    @Override
    public void run(ApplicationArguments args) {
        if (validateOnStartup) {
            assetStorage.verifyReadWrite();
        }
    }
}
