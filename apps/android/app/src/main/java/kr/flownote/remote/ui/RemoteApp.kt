package kr.flownote.remote.ui

import android.content.ClipboardManager
import android.content.Context
import androidx.activity.compose.BackHandler
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.text.KeyboardActions
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.filled.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.ui.viewinterop.AndroidView
import kr.flownote.remote.RemoteViewModel
import kr.flownote.remote.connection.HostProfile
import kr.flownote.remote.connection.Phase
import kr.flownote.remote.terminal.TerminalView
import org.json.JSONObject

@Composable
fun RemoteApp(model: RemoteViewModel) {
    Surface(Modifier.fillMaxSize(), color = MaterialTheme.colorScheme.background) {
        Column(Modifier.fillMaxSize().safeDrawingPadding().imePadding()) {
            if (model.screenTerminal) TerminalScreen(model) else Registration(model)
        }
    }
    model.error?.let { message ->
        AlertDialog(onDismissRequest = { model.error = null }, title = { Text("확인") }, text = { Text(message) },
            confirmButton = { TextButton(onClick = { model.error = null }) { Text("닫기") } })
    }
}

@Composable
private fun Registration(model: RemoteViewModel) {
    val saved = model.profile
    var name by remember(saved) { mutableStateOf(saved?.name ?: "내 PC") }
    var endpoint by remember(saved) { mutableStateOf(saved?.endpoint ?: "") }
    var token by remember(saved) { mutableStateOf(saved?.token ?: "") }
    var fingerprint by remember(saved) { mutableStateOf(saved?.fingerprint ?: "") }
    var verified by remember(saved) { mutableStateOf(saved != null) }
    var importOpen by remember { mutableStateOf(false) }
    var importText by remember { mutableStateOf("") }
    var forgetOpen by remember { mutableStateOf(false) }
    Column(Modifier.fillMaxSize().verticalScroll(rememberScrollState()).padding(horizontal = 24.dp), verticalArrangement = Arrangement.spacedBy(14.dp)) {
        Row(Modifier.fillMaxWidth().padding(top = 20.dp, bottom = 4.dp), verticalAlignment = Alignment.CenterVertically) {
            Icon(Icons.Default.Terminal, null, Modifier.size(30.dp), tint = MaterialTheme.colorScheme.primary)
            Text("Flownote Remote", Modifier.weight(1f).padding(start = 12.dp), style = MaterialTheme.typography.titleLarge)
            if (saved != null) Tool(Icons.Default.DeleteOutline, "PC 삭제") { forgetOpen = true }
        }
        Text("데스크톱 연결", style = MaterialTheme.typography.titleMedium)
        OutlinedTextField(name, { name = it }, label = { Text("PC 이름") }, singleLine = true, modifier = Modifier.fillMaxWidth().testTag("host-name"))
        OutlinedTextField(endpoint, { endpoint = it; verified = false }, label = { Text("WSS 주소") },
            placeholder = { Text("wss://192.168.0.10:7443/v1/connect") }, singleLine = true,
            keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Uri), modifier = Modifier.fillMaxWidth().testTag("host-endpoint"))
        OutlinedTextField(token, { token = it }, label = { Text("기기 토큰") }, singleLine = true,
            visualTransformation = PasswordVisualTransformation(), keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Password),
            modifier = Modifier.fillMaxWidth().testTag("host-token"))
        OutlinedTextField(fingerprint, { fingerprint = it; verified = false }, label = { Text("인증서 SHA-256 지문") },
            minLines = 2, maxLines = 4, textStyle = LocalTextStyle.current.copy(fontFamily = FontFamily.Monospace, fontSize = 13.sp),
            modifier = Modifier.fillMaxWidth().testTag("host-fingerprint"))
        Row(verticalAlignment = Alignment.CenterVertically) {
            Checkbox(verified, { verified = it }, modifier = Modifier.testTag("trust-confirm"))
            Text("PC에 표시된 인증서 지문과 일치함", style = MaterialTheme.typography.bodyMedium, modifier = Modifier.weight(1f))
        }
        Button(onClick = { model.saveAndOpen(HostProfile(name, endpoint.trim(), token.trim(), fingerprint)) },
            enabled = verified && endpoint.isNotBlank() && token.isNotBlank(), modifier = Modifier.fillMaxWidth().heightIn(min = 48.dp).testTag("connect")) {
            Icon(Icons.Default.Power, null); Spacer(Modifier.width(8.dp)); Text("저장하고 연결")
        }
        TextButton(onClick = { importOpen = true }, modifier = Modifier.align(Alignment.CenterHorizontally)) {
            Icon(Icons.Default.ContentPaste, null); Spacer(Modifier.width(8.dp)); Text("Host 등록 JSON 가져오기")
        }
        Spacer(Modifier.height(12.dp))
    }
    if (importOpen) AlertDialog(onDismissRequest = { importOpen = false; importText = "" }, title = { Text("Host 등록 정보") },
        text = { OutlinedTextField(importText, { importText = it }, label = { Text("remote-host init JSON") }, minLines = 4, maxLines = 8, visualTransformation = PasswordVisualTransformation()) },
        dismissButton = { TextButton(onClick = { importOpen = false; importText = "" }) { Text("취소") } },
        confirmButton = { TextButton(onClick = {
            runCatching { HostProfile.fromJson(JSONObject(importText)) }.onSuccess {
                endpoint = it.endpoint; token = it.token; fingerprint = it.fingerprint; verified = false
                importOpen = false; importText = ""
            }.onFailure { model.error = "등록 JSON의 주소, 토큰과 인증서 지문을 확인하세요." }
        }) { Text("가져오기") } })
    if (forgetOpen) AlertDialog(onDismissRequest = { forgetOpen = false }, title = { Text("PC 등록 삭제") },
        text = { Text("저장된 주소와 토큰을 삭제합니다. PC의 실행 중인 세션과 토큰은 별도로 종료·폐기해야 합니다.") },
        dismissButton = { TextButton(onClick = { forgetOpen = false }) { Text("취소") } },
        confirmButton = { TextButton(onClick = { model.forget(); forgetOpen = false }) { Text("삭제") } })
}

@Composable
private fun ColumnScope.TerminalScreen(model: RemoteViewModel) {
    val context = LocalContext.current
    var terminal by remember { mutableStateOf<TerminalView?>(null) }
    var closeDialog by remember { mutableStateOf(false) }
    var editDialog by remember { mutableStateOf(false) }
    var newDialog by remember { mutableStateOf(false) }
    var pasteText by remember { mutableStateOf<String?>(null) }
    var composeInput by remember { mutableStateOf(false) }
    var inputText by remember { mutableStateOf("") }
    var settings by remember { mutableStateOf(false) }
    var fontSize by remember { mutableIntStateOf(14) }
    val connected = model.state.phase == Phase.CONNECTED
    BackHandler { editDialog = true }
    DisposableEffect(Unit) { onDispose { model.renderer = null; terminal?.release() } }
    LaunchedEffect(model.pasteRequested) {
        if (model.pasteRequested) {
            model.pasteRequested = false
            val clipboard = context.getSystemService(Context.CLIPBOARD_SERVICE) as ClipboardManager
            val text = clipboard.primaryClip?.getItemAt(0)?.coerceToText(context)?.toString()
            if (text != null && text.length <= 262144) pasteText = text
            else model.error = "클립보드가 비어 있거나 붙여넣기 크기(256K자)를 초과했습니다."
        }
    }
    Row(Modifier.fillMaxWidth().heightIn(min = 56.dp), verticalAlignment = Alignment.CenterVertically) {
        Tool(Icons.AutoMirrored.Filled.ArrowBack, "PC 설정") { editDialog = true }
        Column(Modifier.weight(1f)) {
            Text(model.profile?.name ?: "터미널", maxLines = 1, style = MaterialTheme.typography.titleMedium)
            Text(model.state.detail, style = MaterialTheme.typography.labelSmall,
                color = if (connected) MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.secondary,
                modifier = Modifier.testTag("connection-status"))
        }
        Tool(Icons.Default.Settings, "터미널 설정") { settings = !settings }
        Tool(Icons.Default.Close, "세션 종료", connected || model.state.phase == Phase.RECOVERY) { closeDialog = true }
    }
    if (settings) Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
        Text("글자 크기", Modifier.padding(start = 16.dp))
        Slider(fontSize.toFloat(), { fontSize = it.toInt(); model.font(fontSize) }, valueRange = 10f..24f, steps = 13, modifier = Modifier.weight(1f))
        Text("$fontSize", Modifier.padding(end = 16.dp))
    }
    if (!connected) Row(Modifier.fillMaxWidth().padding(horizontal = 12.dp), verticalAlignment = Alignment.CenterVertically) {
        when (model.state.phase) {
            Phase.RETRYING, Phase.CONNECTING, Phase.AUTHENTICATING -> TextButton(onClick = model::disconnect) { Text("연결 취소") }
            Phase.RECOVERY -> TextButton(onClick = { newDialog = true }) { Text("새 세션") }
            else -> TextButton(onClick = model::reconnect) { Icon(Icons.Default.Refresh, null); Text("다시 연결") }
        }
    }
    if (remember { TerminalView.supported() }) {
        AndroidView(factory = { ctx -> TerminalView(ctx, model::onBridge).also { view -> terminal = view; model.renderer = view::deliver } },
            modifier = Modifier.weight(1f).fillMaxWidth().testTag("terminal"))
    } else {
        Text("Android System WebView를 업데이트한 뒤 앱을 다시 실행하세요.", Modifier.weight(1f).padding(24.dp))
    }
    if (composeInput) Row(Modifier.fillMaxWidth().padding(horizontal = 8.dp), verticalAlignment = Alignment.CenterVertically) {
        fun submit() { if (connected && inputText.isNotEmpty() && model.input(inputText + "\r")) inputText = "" }
        OutlinedTextField(inputText, { inputText = it }, label = { Text("명령 입력") }, singleLine = true,
            keyboardOptions = KeyboardOptions(imeAction = ImeAction.Send), keyboardActions = KeyboardActions(onSend = { submit() }),
            modifier = Modifier.weight(1f).testTag("command-input"))
        Tool(Icons.Default.Send, "명령 전송", connected) { submit() }
    }
    Row(Modifier.fillMaxWidth().horizontalScroll(rememberScrollState()), verticalAlignment = Alignment.CenterVertically) {
        TextButton(onClick = { model.input("\u001b") }, enabled = connected) { Text("Esc") }
        TextButton(onClick = { model.input("\t") }, enabled = connected) { Text("Tab") }
        TextButton(onClick = { model.modifier("ctrl") }, enabled = connected) { Text("Ctrl", color = if (model.ctrl) MaterialTheme.colorScheme.secondary else MaterialTheme.colorScheme.primary) }
        TextButton(onClick = { model.modifier("alt") }, enabled = connected) { Text("Alt", color = if (model.alt) MaterialTheme.colorScheme.secondary else MaterialTheme.colorScheme.primary) }
        Tool(Icons.Default.Stop, "Ctrl+C", connected) { model.input("\u0003") }
        Tool(Icons.Default.ArrowUpward, "위쪽 방향키", connected) { model.input("\u001b[A") }
        Tool(Icons.Default.ArrowDownward, "아래쪽 방향키", connected) { model.input("\u001b[B") }
        Tool(Icons.Default.KeyboardArrowLeft, "왼쪽 방향키", connected) { model.input("\u001b[D") }
        Tool(Icons.Default.KeyboardArrowRight, "오른쪽 방향키", connected) { model.input("\u001b[C") }
        Tool(Icons.Default.ContentPaste, "붙여넣기", connected) { model.pasteRequested = true }
        Tool(Icons.Default.Edit, "명령 입력창", connected) { composeInput = !composeInput }
        Tool(Icons.Default.Keyboard, "키보드", connected) { model.command("focus") }
        Tool(Icons.Default.LinkOff, "연결 해제") { model.disconnect() }
    }
    if (closeDialog) Confirm("세션 종료", "PC의 현재 터미널을 종료합니다.", "종료", { closeDialog = false }) { model.closeSession(); closeDialog = false }
    if (newDialog) Confirm("새 세션", "기존 터미널을 종료하고 새 터미널을 엽니다.", "시작", { newDialog = false }) { model.newSession(); newDialog = false }
    if (editDialog) Confirm("PC 설정으로 이동", "연결을 해제합니다. 돌아오면 새 터미널을 선택해야 합니다.", "이동", { editDialog = false }) { model.editProfile(); editDialog = false }
    pasteText?.let { content -> AlertDialog(onDismissRequest = { pasteText = null }, title = { Text("붙여넣기 확인") },
        text = { Column(Modifier.heightIn(max = 300.dp).verticalScroll(rememberScrollState())) {
            if (content.contains('\n') || content.contains('\r')) Text("여러 줄 입력은 명령을 즉시 실행할 수 있습니다.", color = MaterialTheme.colorScheme.secondary)
            Text(content.take(8000), fontFamily = FontFamily.Monospace, fontSize = 12.sp)
            if (content.length > 8000) Text("미리보기 생략 · 전체 ${content.length}자")
        } }, dismissButton = { TextButton(onClick = { pasteText = null }) { Text("취소") } },
        confirmButton = { TextButton(onClick = { model.paste(content); pasteText = null }) { Text("붙여넣기") } }) }
}

@Composable
private fun Confirm(title: String, message: String, action: String, dismiss: () -> Unit, confirm: () -> Unit) {
    AlertDialog(onDismissRequest = dismiss, title = { Text(title) }, text = { Text(message) },
        dismissButton = { TextButton(onClick = dismiss) { Text("취소") } },
        confirmButton = { TextButton(onClick = confirm) { Text(action) } })
}

@Composable
private fun Tool(icon: ImageVector, label: String, enabled: Boolean = true, action: () -> Unit) {
    IconButton(onClick = action, enabled = enabled, modifier = Modifier.size(48.dp)) { Icon(icon, contentDescription = label) }
}
