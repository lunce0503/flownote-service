package kr.flownote.remote

import android.graphics.Bitmap
import android.view.View
import android.view.ViewGroup
import android.view.WindowManager
import android.webkit.WebView
import androidx.compose.ui.test.*
import androidx.compose.ui.test.junit4.createAndroidComposeRule
import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.test.platform.app.InstrumentationRegistry
import androidx.test.uiautomator.UiDevice
import kr.flownote.remote.connection.*
import kr.flownote.remote.security.*
import okhttp3.*
import org.json.JSONObject
import org.junit.Assert.*
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import java.io.File
import java.util.concurrent.CountDownLatch
import java.util.concurrent.TimeUnit
import java.util.concurrent.atomic.AtomicReference

@RunWith(AndroidJUnit4::class)
class RemoteAppTest {
    @get:Rule val ui = createAndroidComposeRule<MainActivity>()
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
        ui.waitUntil(20_000) { evaluate("document.querySelector('.xterm-rows')?.innerText || ''").contains(value) }
    }
    private fun phase(expected: Phase) { ui.waitUntil(25_000) { ui.activity.model.state.phase == expected } }
    private fun action(block: (RemoteViewModel) -> Unit) { instrumentation.runOnMainSync { block(ui.activity.model) } }
    private fun screenshot(name: String) {
        instrumentation.runOnMainSync { ui.activity.window.clearFlags(WindowManager.LayoutParams.FLAG_SECURE) }
        val bitmap = instrumentation.uiAutomation.takeScreenshot()
        assertNotNull(bitmap)
        File(instrumentation.targetContext.getExternalFilesDir(null), "$name.png").outputStream().use { bitmap.compress(Bitmap.CompressFormat.PNG, 100, it) }
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
        rejected(host.copy(fingerprint = "00".repeat(32)))
        rejected(host.copy(token = "invalid-token-long-enough"))
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
        action { it.input("printf '\\033[32mREMOTE_%s\\033[0m\\n' OK\rpwd\rgit status --short\r") }
        terminalContains("REMOTE_OK")
        ui.onNodeWithContentDescription("명령 입력창").performScrollTo().performClick()
        ui.onNodeWithTag("command-input").performTextInput("printf '한글%s\\n' 입력")
        ui.onNodeWithContentDescription("명령 전송").performClick()
        terminalContains("한글입력")
        action { it.input("printf 'TAB_%s\\n' DONE"); it.input("\r"); it.input("\u001b[A"); it.input("\u0003") }
        terminalContains("TAB_DONE")
        val session = store.rememberedSession()
        repeat(10) {
            action { it.disconnect() }; phase(Phase.DISCONNECTED)
            action { it.reconnect() }; phase(Phase.CONNECTED)
            assertEquals(session, store.rememberedSession())
        }
        val device = UiDevice.getInstance(instrumentation)
        device.setOrientationLeft()
        action { it.input("printf 'ROTATE_%s\\n' OK\r") }
        terminalContains("ROTATE_OK")
        screenshot("terminal-landscape")
        device.setOrientationNatural()
        action { it.input("printf 'PORTRAIT_%s\\n' OK\r") }
        terminalContains("PORTRAIT_OK")
        screenshot("terminal-phone")
        // Rotation must preserve the same PTY and xterm screen.
        assertEquals(session, store.rememberedSession())
        action { it.closeSession() }; phase(Phase.ENDED)
        assertNull(store.rememberedSession())
        device.unfreezeRotation()
    }
}
