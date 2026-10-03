package kr.flownote.remote

import android.app.Application
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import androidx.lifecycle.AndroidViewModel
import androidx.lifecycle.viewModelScope
import kr.flownote.remote.connection.*
import kr.flownote.remote.security.ProfileStore
import org.json.JSONObject

class RemoteViewModel(application: Application) : AndroidViewModel(application) {
    private val store = ProfileStore(application)
    var profile by mutableStateOf<HostProfile?>(null); private set
    var screenTerminal by mutableStateOf(false); private set
    var state by mutableStateOf(ConnectionState()); private set
    var error by mutableStateOf<String?>(null)
    var ctrl by mutableStateOf(false); private set
    var alt by mutableStateOf(false); private set
    var pasteRequested by mutableStateOf(false)
    var renderer: ((JSONObject) -> Unit)? = null
    private var ready = false
    private var wasConnected = false
    private var connection = makeConnection()
    init {
        runCatching { store.load() }.onSuccess { profile = it }.onFailure { error = "저장된 인증 정보를 읽을 수 없습니다. PC 정보를 다시 등록하세요." }
    }
    private fun makeConnection() = RemoteConnection(viewModelScope, { next ->
        state = next
        renderer?.invoke(JSONObject().put("type", "enabled").put("value", next.phase == Phase.CONNECTED))
    }, { text, seq ->
        renderer?.invoke(JSONObject().put("type", "output").put("seq", seq).put("data", text))
    }, { renderer?.invoke(JSONObject().put("type", "reset")) }, { id -> store.rememberSession(id) })

    fun saveAndOpen(host: HostProfile) {
        runCatching {
            val validated = host.validated()
            if (profile != validated && store.rememberedSession() != null) store.rememberSession(null)
            store.save(validated); profile = validated; screenTerminal = true; error = null
        }.onFailure { error = it.message ?: "PC 정보를 저장하지 못했습니다." }
    }
    fun onBridge(message: JSONObject) {
        when (message.getString("type")) {
            "ready" -> {
                ready = true
                connection.resize(message.getInt("cols"), message.getInt("rows"))
                profile?.let { connection.connect(it, store.rememberedSession()) }
            }
            "input" -> if (!connection.input(message.getString("data"))) error = "입력을 보내지 못했습니다. 연결 상태를 확인하세요. 입력은 자동 재전송되지 않습니다."
            "resize" -> connection.resize(message.getInt("cols"), message.getInt("rows"))
            "ack" -> connection.acknowledge(message.getLong("seq"))
            "modifiers" -> { ctrl = message.getBoolean("ctrl"); alt = message.getBoolean("alt") }
            "paste" -> pasteRequested = true
        }
    }
    fun input(text: String) { if (!connection.input(text)) error = "연결 후 다시 입력하세요." }
    fun reconnect() { if (ready) profile?.let { connection.connect(it) } }
    fun disconnect() = connection.disconnect()
    fun newSession() = connection.newSession()
    fun closeSession() = connection.closeSession()
    fun command(type: String) { renderer?.invoke(JSONObject().put("type", type)) }
    fun modifier(key: String) { renderer?.invoke(JSONObject().put("type", "modifier").put("key", key)) }
    fun paste(text: String) { renderer?.invoke(JSONObject().put("type", "paste").put("data", text)) }
    fun font(size: Int) { renderer?.invoke(JSONObject().put("type", "font").put("size", size)) }
    fun background() { wasConnected = state.phase in listOf(Phase.CONNECTED, Phase.CONNECTING, Phase.AUTHENTICATING, Phase.RETRYING); connection.disconnect() }
    fun foreground() { if (wasConnected) { wasConnected = false; reconnect() } }
    fun editProfile() {
        connection.dispose(); renderer = null; ready = false; wasConnected = false
        connection = makeConnection(); screenTerminal = false
    }
    fun forget() { editProfile(); store.clear(); profile = null }
    override fun onCleared() { connection.dispose() }
}
