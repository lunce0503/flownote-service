package kr.flownote.remote

import android.content.ClipData
import android.content.ClipboardManager
import android.content.Context
import android.view.View
import android.view.ViewGroup
import android.view.WindowManager
import android.webkit.WebView
import androidx.compose.ui.test.*
import androidx.compose.ui.test.junit4.createAndroidComposeRule
import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.test.platform.app.InstrumentationRegistry
import androidx.test.core.graphics.writeToTestStorage
import androidx.test.uiautomator.UiDevice
import androidx.test.rule.GrantPermissionRule
import androidx.test.runner.lifecycle.ActivityLifecycleMonitorRegistry
import androidx.test.runner.lifecycle.Stage
import kotlinx.coroutines.runBlocking
import androidx.lifecycle.Lifecycle
import kr.flownote.remote.connection.*
import kr.flownote.remote.security.*
import okhttp3.*
import org.json.JSONObject
import org.junit.Assert.*
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.junit.rules.TestWatcher
import org.junit.runner.Description
import java.io.File
import java.util.concurrent.CountDownLatch
import java.util.concurrent.TimeUnit
import java.util.concurrent.atomic.AtomicReference

@RunWith(AndroidJUnit4::class)
class RemoteAppTest {
    @get:Rule val ui = createAndroidComposeRule<MainActivity>()
    @get:Rule val camera: GrantPermissionRule = GrantPermissionRule.grant(android.Manifest.permission.CAMERA)
    @get:Rule(order = 10) val failureEvidence = object : TestWatcher() {
        override fun failed(error: Throwable, description: Description) { runCatching { screenshot("acceptance-failure") } }
    }
    private val instrumentation get() = InstrumentationRegistry.getInstrumentation()
    private val profile get() = HostProfile.fromJson(JSONObject(instrumentation.context.assets.open("host.json").bufferedReader().readText()))

    private fun evaluate(script: String): String {
        val latch = CountDownLatch(1)
        val result = AtomicReference("")
        instrumentation.runOnMainSync {
            fun find(view: View): WebView? {
                if (view is WebView) return view
                if (view is ViewGroup) for (i in 0 until view.childCount) find(view.getChildAt(i))?.let { return it }
                return null
            }
            val web = find(ui.activity.window.decorView)
            if (web == null) latch.countDown()
            else web.evaluateJavascript(script) { result.set(it); latch.countDown() }
        }
        assertTrue(latch.await(5, TimeUnit.SECONDS))
        return result.get()
    }
    private fun terminalContains(value: String) {
        try {
            ui.waitUntil(20_000) { evaluate("document.querySelector('.xterm-rows')?.innerText || ''").contains(value) }
        } catch (failure: Throwable) {
            screenshot("terminal-failure")
            val layout = evaluate("JSON.stringify({viewport:[innerWidth,innerHeight,devicePixelRatio], elements:['html','body','#terminal','.xterm','.xterm-screen','.xterm-rows'].map(s=>{const e=document.querySelector(s);return {s,rect:e?.getBoundingClientRect(),height:e&&getComputedStyle(e).height,children:e?.children.length}})})")
            throw AssertionError("Missing $value, state=${ui.activity.model.state}; rows=${evaluate("document.querySelector('.xterm-rows')?.innerText || document.body.innerText")}; layout=$layout", failure)
        }
    }
    private fun phase(expected: Phase) { ui.waitUntil(25_000) { ui.activity.model.state.phase == expected } }
    private fun action(block: (RemoteViewModel) -> Unit) { instrumentation.runOnMainSync { block(ui.activity.model) } }
    private fun screenshot(name: String) {
        instrumentation.runOnMainSync {
            ActivityLifecycleMonitorRegistry.getInstance().getActivitiesInStage(Stage.RESUMED).forEach { it.window.clearFlags(WindowManager.LayoutParams.FLAG_SECURE) }
        }
        instrumentation.waitForIdleSync()
        Thread.sleep(250)
        val bitmap = instrumentation.uiAutomation.takeScreenshot()
        assertNotNull(bitmap)
        bitmap.writeToTestStorage(name)
        assertTrue(bitmap.width > 0 && bitmap.height > 0)
        bitmap.recycle()
    }
    private fun rejected(host: HostProfile) {
        val latch = CountDownLatch(1)
        var connected = false
        val client = pinnedClient(host)
        val socket = client.newWebSocket(Request.Builder().url(host.endpoint).header("Authorization", "Bearer ${host.token}").build(), object : WebSocketListener() {
            override fun onOpen(webSocket: WebSocket, response: Response) { connected = true; latch.countDown() }
            override fun onFailure(webSocket: WebSocket, t: Throwable, response: Response?) { response?.close(); latch.countDown() }
        })
        assertTrue(latch.await(20, TimeUnit.SECONDS)); socket.cancel()
        client.dispatcher.executorService.shutdown(); client.connectionPool.evictAll()
        assertFalse(connected)
    }

    @Test fun registrationTerminalSecurityAndReconnect() {
        val host = profile
        legacyStorageMigration(host)
        rejected(host.copy(fingerprint = "00".repeat(32)))
        rejected(host.copy(token = "invalid-token-long-enough"))
        screenshot("registration-empty")
        ui.onNodeWithTag("host-name").performTextReplacement(host.name)
        ui.onNodeWithTag("host-endpoint").performTextInput(host.endpoint)
        ui.onNodeWithTag("host-token").performTextInput(host.token)
        ui.onNodeWithTag("host-fingerprint").performTextInput(host.fingerprint)
        ui.onNodeWithTag("trust-confirm").performScrollTo().performClick()
        screenshot("registration-phone")
        ui.onNodeWithTag("connect").performScrollTo().performClick()
        phase(Phase.CONNECTED)
        val store = ProfileStore(instrumentation.targetContext)
        assertEquals(host.token, store.load()?.token)
        val raw = File(instrumentation.targetContext.applicationInfo.dataDir, "shared_prefs/remote-host-private.xml").readText()
        assertFalse(raw.contains(host.token))
        action { it.input("PS1='remote-test$ '\rpwd\rgit status --short\rprintf '\\033[32mREMOTE_%s\\033[0m\\n' OK\r") }
        terminalContains("REMOTE_OK")
        ui.onNodeWithContentDescription("명령 입력창").performScrollTo().performClick()
        ui.onNodeWithTag("command-input").performTextInput("printf '한글%s\\n' 입력")
        ui.onNodeWithContentDescription("명령 전송").performClick()
        terminalContains("한글입력")
        action { it.input("printf 'TAB_%s\\n' DONE\r") }
        terminalContains("TAB_DONE")
        // Exercise actual toolbar keys, not only ViewModel input calls.
        ui.onNodeWithText("Tab", useUnmergedTree = true).performScrollTo().performClick()
        ui.onNodeWithContentDescription("Ctrl+C").performScrollTo().performClick()
        ui.onNodeWithContentDescription("위쪽 방향키").performScrollTo().performClick()
        ui.onNodeWithContentDescription("Ctrl+C").performScrollTo().performClick()
        instrumentation.runOnMainSync {
            val clipboard = ui.activity.getSystemService(Context.CLIPBOARD_SERVICE) as ClipboardManager
            clipboard.setPrimaryClip(ClipData.newPlainText("test", "printf 'PASTE_%s\\n' OK\n"))
        }
        ui.onNodeWithContentDescription("붙여넣기").performScrollTo().performClick()
        ui.onNodeWithText("붙여넣기 확인").assertIsDisplayed()
        screenshot("paste-confirmation")
        ui.onNodeWithText("취소").performClick()
        assertFalse(evaluate("document.querySelector('.xterm-rows')?.innerText || ''").contains("PASTE_OK"))
        val session = store.rememberedSession()
        repeat(10) {
            action { it.disconnect() }; phase(Phase.DISCONNECTED)
            action { it.reconnect() }; phase(Phase.CONNECTED)
            assertEquals(session, store.rememberedSession())
        }
        ui.activityRule.scenario.moveToState(Lifecycle.State.CREATED)
        phase(Phase.DISCONNECTED)
        ui.activityRule.scenario.moveToState(Lifecycle.State.RESUMED)
        phase(Phase.CONNECTED)
        assertEquals(session, store.rememberedSession())
        val device = UiDevice.getInstance(instrumentation)
        device.setOrientationLeft()
        ui.onNodeWithTag("command-input").performClick()
        ui.waitUntil(10_000) { evaluate("innerWidth > innerHeight && innerHeight >= 80") == "true" }
        action { it.input("printf 'ROTATE_%s\\n' OK\r") }
        terminalContains("ROTATE_OK")
        screenshot("terminal-landscape")
        device.setOrientationNatural()
        action { it.input("printf 'PORTRAIT_%s\\n' OK\r") }
        terminalContains("PORTRAIT_OK")
        screenshot("terminal-phone")
        // Rotation must preserve the same PTY and xterm screen.
        assertEquals(session, store.rememberedSession())
        // Destroying the actual WebView cannot be treated as a complete ANSI recovery.
        ui.activityRule.scenario.recreate()
        phase(Phase.RECOVERY)
        ui.onNodeWithText("새 세션").performClick()
        ui.onNodeWithText("시작").performClick()
        phase(Phase.CONNECTED)
        assertNotEquals(session, store.rememberedSession())
        action { it.input("printf 'NEW_SESSION_%s\\n' OK\r") }
        terminalContains("NEW_SESSION_OK")
        action { it.closeSession() }; phase(Phase.ENDED)
        assertNull(store.rememberedSession())
        device.unfreezeRotation()
        computersAndQr(store)
    }

    private fun legacyStorageMigration(host: HostProfile) {
        val context = instrumentation.targetContext
        val store = ProfileStore(context)
        store.save(host)
        val key = java.security.KeyStore.getInstance("AndroidKeyStore").apply { load(null) }.getKey("flownote-remote-profile-v1", null)
        val cipher = javax.crypto.Cipher.getInstance("AES/GCM/NoPadding").apply { init(javax.crypto.Cipher.ENCRYPT_MODE, key) }
        val encrypted = cipher.doFinal(host.json().toString().toByteArray(Charsets.UTF_8))
        val legacy = android.util.Base64.encodeToString(cipher.iv + encrypted, android.util.Base64.NO_WRAP)
        val session = java.util.UUID.randomUUID().toString()
        val preferences = context.getSharedPreferences("remote-host-private", Context.MODE_PRIVATE)
        assertTrue(preferences.edit().clear().putString("profile", legacy).putString("session", session).commit())
        val migrated = ProfileStore(context).catalog()
        assertEquals(host, migrated.selected()?.profile)
        assertEquals(session, migrated.sessions[migrated.selectedId])
        assertFalse(preferences.contains("profile"))
        assertFalse(preferences.contains("session"))
        assertTrue(preferences.contains("catalog-v2"))
        assertTrue(preferences.edit().clear().commit())
    }

    private fun computersAndQr(store: ProfileStore) {
        val second = HostProfile.fromJson(JSONObject(instrumentation.context.assets.open("host-second.json").bufferedReader().readText()))
        val first = store.catalog().hosts.single()
        action { it.editProfile() }
        ui.onNodeWithContentDescription("PC 추가").performClick()
        ui.onNodeWithTag("host-name").performTextReplacement(second.name)
        ui.onNodeWithTag("host-endpoint").performTextInput(second.endpoint)
        ui.onNodeWithTag("host-token").performTextInput(second.token)
        ui.onNodeWithTag("host-fingerprint").performTextInput(second.fingerprint)
        ui.onNodeWithTag("trust-confirm").performScrollTo().performClick()
        ui.onNodeWithTag("save-computer").performScrollTo().performClick()
        ui.waitUntil(5_000) { store.catalog().hosts.size == 2 }
        val secondId = store.catalog().hosts.single { it.profile.endpoint == second.endpoint }.id
        assertEquals(2, ProfileStore(instrumentation.targetContext).catalog().hosts.size)
        ui.onNodeWithTag("computer-${first.id}").assertIsDisplayed()
        screenshot("computer-list")
        ui.onNodeWithTag("computer-$secondId").performClick()
        phase(Phase.CONNECTED)
        action { assertTrue(it.input("printf 'SECOND_%s\\n' OK\r")) }
        terminalContains("SECOND_OK")
        val secondSession = store.rememberedSession(secondId)
        assertNotNull(secondSession)
        assertNull(store.rememberedSession(first.id))
        action { it.editProfile() }
        ui.onNodeWithTag("computer-${first.id}").performClick()
        phase(Phase.CONNECTED)
        assertNotEquals(secondSession, store.rememberedSession(first.id))
        assertEquals(secondSession, store.rememberedSession(secondId))
        assertEquals(profile.token, ui.activity.model.profile?.token)
        action { it.closeSession() }; phase(Phase.ENDED)
        action { it.editProfile() }
        ui.onNodeWithTag("computer-$secondId").performClick()
        phase(Phase.RECOVERY)
        ui.onNodeWithText("새 세션").performClick()
        ui.onNodeWithText("시작").performClick()
        phase(Phase.CONNECTED)
        action { it.closeSession() }; phase(Phase.ENDED)
        action { it.editProfile() }
        ui.onNodeWithContentDescription("Second PC 편집").performClick()
        ui.onNodeWithTag("host-name").performTextReplacement("Second renamed")
        ui.onNodeWithTag("host-name").assertTextContains("Second renamed")
        ui.onNodeWithTag("save-computer").performScrollTo().assertIsEnabled().performClick()
        ui.waitUntil(5_000) { store.catalog().hosts.single { it.id == secondId }.profile.name == "Second renamed" }
        assertEquals("Second renamed", store.catalog().hosts.single { it.id == secondId }.profile.name)
        ui.onNodeWithContentDescription("Second renamed 삭제").performClick()
        ui.onNodeWithText("삭제", useUnmergedTree = true).performClick()
        ui.waitUntil(5_000) { store.catalog().hosts.size == 1 }
        assertEquals(listOf(first.id), store.catalog().hosts.map { it.id })
        assertEquals(first.profile.token, store.catalog().hosts.single().profile.token)
        val bitmap = android.graphics.BitmapFactory.decodeStream(instrumentation.context.assets.open("pairing.png"))
        val pixels = IntArray(bitmap.width * bitmap.height)
        bitmap.getPixels(pixels, 0, bitmap.width, 0, 0, bitmap.width, bitmap.height)
        val decoded = com.google.zxing.qrcode.QRCodeReader().decode(com.google.zxing.BinaryBitmap(
            com.google.zxing.common.HybridBinarizer(com.google.zxing.RGBLuminanceSource(bitmap.width, bitmap.height, pixels)))).text
        bitmap.recycle()
        val invitation = PairingInvitation.parse(decoded)
        assertEquals(second.endpoint, invitation.endpoint)
        println("REMOTE_ACCEPTANCE: MULTI_PC_OK")
        ui.onNodeWithContentDescription("QR 등록").performClick()
        try {
            ui.waitUntil(45_000) { ui.onAllNodesWithTag("host-name").fetchSemanticsNodes(atLeastOneRootRequired = false).isNotEmpty() }
        } catch (failure: Throwable) { screenshot("qr-camera-failure"); throw failure }
        ui.onNodeWithTag("host-name").assertTextContains("QR PC")
        println("REMOTE_ACCEPTANCE: QR_CAMERA_OK")
        ui.onNodeWithTag("trust-confirm").assertIsOff()
        assertEquals(1, store.catalog().hosts.size)
        screenshot("qr-confirmation")
        ui.onNodeWithTag("trust-confirm").performScrollTo().performClick()
        ui.onNodeWithTag("connect").performScrollTo().performClick()
        phase(Phase.CONNECTED)
        action { assertTrue(it.input("printf 'QR_PAIRED_%s\\n' OK\r")) }
        terminalContains("QR_PAIRED_OK")
        val qr = store.catalog().hosts.single { it.profile.name == "QR PC" }
        assertEquals(second.endpoint, qr.profile.endpoint)
        assertNotEquals(second.token, qr.profile.token)
        println("REMOTE_ACCEPTANCE: QR_PAIR_OK")
        val raw = File(instrumentation.targetContext.applicationInfo.dataDir, "shared_prefs/remote-host-private.xml").readText()
        assertFalse(raw.contains(qr.profile.token))
        runBlocking {
            try { PairingClient().redeem(invitation, "reused"); fail("QR reused") } catch (_: IllegalArgumentException) {}
        }
        action { it.closeSession() }; phase(Phase.ENDED)
        action { it.editProfile() }
        screenshot("computer-list-qr")
        ui.onNodeWithContentDescription("CI Linux PC 편집").performClick()
        ui.onNodeWithTag("host-name").assertTextContains("CI Linux PC")
        ui.onNodeWithTag("host-token").assertExists()
        ui.onNodeWithContentDescription("컴퓨터 목록").performClick()
    }
}
