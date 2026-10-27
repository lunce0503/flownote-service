plugins { id("com.android.application") }

android {
    namespace = "com.flownote.remote.gesture"
    compileSdk = 35
    defaultConfig {
        applicationId = "com.flownote.remote.gesture"
        minSdk = 29
        targetSdk = 35
        versionCode = 10
        versionName = "0.6.0"
        testInstrumentationRunner = "androidx.test.runner.AndroidJUnitRunner"
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
    sourceSets.getByName("main").assets.srcDir("../../artifacts/android-vision")
    sourceSets.getByName("test").resources.srcDir("../../tests/fixtures")
    testOptions { unitTests.isReturnDefaultValues = false }
}

dependencies {
    implementation("com.google.mediapipe:tasks-vision:1.1.1")
    implementation("com.squareup.okhttp3:okhttp:4.12.0")
    implementation("com.google.zxing:core:3.5.4")
    testImplementation("junit:junit:4.13.2")
    testImplementation("org.json:json:20240303")
    androidTestImplementation("androidx.test.ext:junit:1.2.1")
    androidTestImplementation("androidx.test:runner:1.6.2")
}

val prepareGestureModels by tasks.registering(Exec::class) {
    workingDir(rootProject.projectDir.parentFile)
    commandLine("node", "scripts/prepare-vision.mjs")
}
tasks.named("preBuild").configure { dependsOn(prepareGestureModels) }
