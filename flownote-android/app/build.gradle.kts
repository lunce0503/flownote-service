plugins { id("com.android.application") }

android {
    namespace = "com.flownote.mobile"
    compileSdk = 35
    defaultConfig {
        applicationId = "com.flownote.mobile"
        minSdk = 29
        targetSdk = 35
        versionCode = 10000
        versionName = "1.0.0"
    }
    signingConfigs {
        create("distribution") {
            val signingPath = System.getenv("FLOWNOTE_ANDROID_KEYSTORE")
            if (signingPath != null) {
                storeFile = file(signingPath)
                storePassword = System.getenv("FLOWNOTE_ANDROID_SIGNING_PASSWORD")
                keyAlias = "flownote-android"
                keyPassword = System.getenv("FLOWNOTE_ANDROID_SIGNING_PASSWORD")
            }
        }
    }
    buildTypes {
        debug {
            applicationIdSuffix = ".staging"
            versionNameSuffix = "-staging"
            buildConfigField("String", "WEB_URL", "\"https://flownote-react-staging.vercel.app\"")
        }
        release {
            signingConfig = signingConfigs.getByName("distribution")
            buildConfigField("String", "WEB_URL", "\"https://flownote-react.vercel.app\"")
            isMinifyEnabled = false
        }
    }
    buildFeatures { buildConfig = true }
    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }
}
