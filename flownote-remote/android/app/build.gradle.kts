plugins { id("com.android.application") }

android {
    namespace = "com.flownote.remote.gesture"
    compileSdk = 35
    defaultConfig {
        applicationId = "com.flownote.remote.gesture"
        minSdk = 29
        targetSdk = 35
        versionCode = 2
        versionName = "0.1.1"
    }
    signingConfigs {
        create("distribution") {
            val keyPath = System.getenv("FLOWNOTE_REMOTE_KEYSTORE")
            if (keyPath != null) {
                storeFile = file(keyPath)
                storePassword = System.getenv("FLOWNOTE_REMOTE_SIGNING_PASSWORD")
                keyAlias = "flownote-remote"
                keyPassword = System.getenv("FLOWNOTE_REMOTE_SIGNING_PASSWORD")
            }
        }
    }
    buildTypes {
        debug { applicationIdSuffix = ".staging"; versionNameSuffix = "-staging" }
        release {
            isMinifyEnabled = false
            if (System.getenv("FLOWNOTE_REMOTE_KEYSTORE") != null)
                signingConfig = signingConfigs.getByName("distribution")
        }
    }
    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }
    sourceSets.getByName("main").assets.srcDir("../../config")
    testOptions { unitTests.isReturnDefaultValues = false }
}

dependencies {
    testImplementation("junit:junit:4.13.2")
    testImplementation("org.json:json:20240303")
}
