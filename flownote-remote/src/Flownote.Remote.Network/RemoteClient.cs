using System.Net.Http.Json;
using System.Net.WebSockets;
using System.Text.Json;
using Flownote.Remote.Core;

namespace Flownote.Remote.Network;

public sealed class RemoteClient : IAsyncDisposable
{
    private readonly ClientWebSocket socket = new();
    private readonly SemaphoreSlim writer = new(1), frameGate = new(1);
    private readonly CancellationTokenSource stop = new();
    private readonly Func<OutputCommand, Task<OutputResult>> output;
    private readonly Func<HealthSample> health;
    private readonly Func<InterfaceCommand,Task<InterfaceResult>>? control;
    private readonly Dictionary<Guid,InterfaceResult> controls = [];
    public HubState? State { get; private set; }
    private readonly HashSet<Guid> applied = [], noticed = [];
    private TaskCompletionSource<bool>? frameAck;
    private Guid pendingFrame;
    private long lastSkeletonWarning = -10000;
    private readonly TaskCompletionSource<bool> welcome = new(TaskCreationOptions.RunContinuationsAsynchronously);
    private Task receiver = Task.CompletedTask, heartbeat = Task.CompletedTask;
    private bool intentional;
    public bool Enabled { get; private set; } = true;
    public Guid DeviceId { get; private set; }
    public bool Connected => socket.State == WebSocketState.Open;
    public event Action<HubState>? StateChanged;
    public event Action<AlertNotice>? Alert;
    public event Action<string>? Activity;
    public event Action<GestureSample>? Gesture;

    public RemoteClient(Func<OutputCommand, Task<OutputResult>> output, Func<HealthSample> health,
        Func<InterfaceCommand,Task<InterfaceResult>>? control = null)
    { this.output = output; this.health = () => health() with { InterfaceReady = control is not null }; this.control = control; }

    public static async Task<PairResult> PairAsync(string address, string pin, string code, string name, CancellationToken cancellation = default)
    {
        var uri = Protocol.ServerUri(address);
        pin = Protocol.NormalizePin(pin);
        if (pin.Length != 64 || !pin.All(Uri.IsHexDigit)) throw new ArgumentException("서버의 SHA-256 지문을 확인하세요.");
        using var handler = new HttpClientHandler { AllowAutoRedirect = false };
        handler.ServerCertificateCustomValidationCallback = (_, cert, _, errors) => Protocol.Trust(cert, pin, errors);
        using var http = new HttpClient(handler) { Timeout = TimeSpan.FromSeconds(8) };
        using var response = await http.PostAsJsonAsync(new Uri(uri, "/v1/pair"), new PairRequest(code.Trim(), name.Trim()), Protocol.Json, cancellation);
        if (!response.IsSuccessStatusCode) throw new InvalidOperationException("기기 등록 실패: 코드의 유효 시간·서버 지문·등록 기기 수를 확인하세요.");
        return await response.Content.ReadFromJsonAsync<PairResult>(Protocol.Json, cancellation) ?? throw new InvalidOperationException("기기 등록 응답이 비어 있습니다.");
    }

    public async Task ConnectAsync(string address, string pin, PairResult grant)
    {
        var uri = Protocol.ServerUri(address); pin = Protocol.NormalizePin(pin);
        if (pin.Length != 64 || !pin.All(Uri.IsHexDigit) || grant.Token.Length != 64 || !grant.Token.All(Uri.IsHexDigit)) throw new ArgumentException("연결 자격 증명을 확인하세요.");
        DeviceId = grant.DeviceId;
        socket.Options.SetRequestHeader("Authorization", "Bearer " + grant.Token);
        socket.Options.RemoteCertificateValidationCallback = (_, certificate, _, errors) => Protocol.Trust(certificate, pin, errors);
        socket.Options.KeepAliveInterval = TimeSpan.FromSeconds(5);
        var ws = new UriBuilder(uri) { Scheme = "wss", Path = "/v1/session" }.Uri;
        using var timeout = new CancellationTokenSource(TimeSpan.FromSeconds(8));
        await socket.ConnectAsync(ws, timeout.Token);
        receiver = ReceiveAsync(); heartbeat = HeartbeatAsync();
        await welcome.Task.WaitAsync(TimeSpan.FromSeconds(8));
    }

    public Task CommandAsync(Guid target, string action, Guid? commandId = null)
    {
        if (action is not ("volume_up" or "volume_down" or "mute" or "unmute")) throw new ArgumentException("허용되지 않은 명령입니다.");
        return SendAsync(new { type = "command", commandId = commandId ?? Guid.NewGuid(), targetId = target, action });
    }
    public Task SendCameraAsync(byte[] jpeg) => throw new InvalidOperationException("원본 영상은 전송하지 않습니다. SendSkeletonAsync를 사용하세요.");
    public async Task SendSkeletonAsync(SkeletonFrame frame)
    {
        frame.Validate();
        if (JsonSerializer.SerializeToUtf8Bytes(new { type = "skeleton.frame", frameId = Guid.NewGuid(), frame },Protocol.Json).Length > 16384)
            throw new ArgumentException("골격 메시지는 최대 16KiB입니다.");
        if (State?.Capabilities?.SkeletonFrames != true) throw new InvalidOperationException("서버가 골격 입력을 지원하지 않습니다. 서버를 업데이트하세요.");
        if (!Connected || !await frameGate.WaitAsync(0)) return;
        try
        {
            frameAck = new(TaskCreationOptions.RunContinuationsAsynchronously);
            pendingFrame = Guid.NewGuid();
            await SendAsync(new { type = "skeleton.frame", frameId = pendingFrame, frame });
            await frameAck.Task.WaitAsync(TimeSpan.FromSeconds(6), stop.Token);
        }
        finally { frameAck = null; frameGate.Release(); }
    }
    public Task StopCameraAsync() => SendAsync(new { type = "camera.stop" });
    public Task SetEnabledAsync(bool enabled) => SendAsync(new { type = "device.enabled", enabled });
    public Task SelectTaskAsync(Guid id) => SendAsync(new { type = "task.select", taskId = id });
    public Task ControlAsync(Guid target, string action, double value = 0, double x = 0, double y = 0) =>
        SendAsync(new { type = "control", targetId = target, command = new InterfaceCommand(Guid.NewGuid(),"precision",action,value,x,y) });
    private void ReadState(JsonElement message)
    {
        var state = message.GetProperty("state").Deserialize<HubState>(Protocol.Json) ?? throw new ArgumentException();
        State = state;
        Enabled = state.Devices.FirstOrDefault(d => d.Id == DeviceId)?.Enabled == true;
        StateChanged?.Invoke(state);
    }
    private Task SendAsync(object message) => SocketJson.SendAsync(socket, writer, message, stop.Token);

    private async Task ReceiveAsync()
    {
        try
        {
            while (!stop.IsCancellationRequested && socket.State == WebSocketState.Open)
            {
                using var document = await SocketJson.ReceiveAsync(socket, stop.Token);
                if (document is null) break;
                var message = document.RootElement;
                switch (message.GetProperty("type").GetString())
                {
                    case "welcome":
                        ReadState(message); welcome.TrySetResult(true); Activity?.Invoke("서버 연결됨"); break;
                    case "state": ReadState(message); break;
                    case "pointer.result":
                        if (!message.GetProperty("accepted").GetBoolean()) Activity?.Invoke("마우스 입력이 적용되지 않았습니다. 대상 기기의 허용 상태를 확인하세요.");
                        break;
                    case "skeleton.result":
                        if (message.GetProperty("frameId").GetGuid() != pendingFrame) break;
                        bool rejected = message.TryGetProperty("accepted",out var accepted) && accepted.ValueKind == JsonValueKind.False;
                        if (rejected && Environment.TickCount64-lastSkeletonWarning >= 5000)
                        {
                            lastSkeletonWarning = Environment.TickCount64;
                            string? code = message.TryGetProperty("errorCode",out var reason) && reason.ValueKind == JsonValueKind.String ? reason.GetString() : null;
                            Activity?.Invoke(SkeletonDiagnostics.Message(code));
                        }
                        Gesture?.Invoke(new(rejected ? "Rejected" : message.GetProperty("gesture").GetString(), message.GetProperty("confidence").GetDouble()));
                        frameAck?.TrySetResult(true); break;
                    case "interface.set":
                        var instruction = message.GetProperty("command").Deserialize<InterfaceCommand>(Protocol.Json) ?? throw new ArgumentException();
                        instruction.Validate();
                        InterfaceResult interfaceResult;
                        try
                        {
                            if ((!Enabled && instruction.Action != "pointer.up") || control is null) interfaceResult = new(false, Error: "interface_unavailable");
                            else if (controls.TryGetValue(instruction.CommandId, out var previous)) interfaceResult = previous;
                            else
                            {
                                interfaceResult = await control(instruction);
                                if (interfaceResult.Applied) { if (controls.Count >= 128) controls.Clear(); controls.Add(instruction.CommandId,interfaceResult); }
                            }
                        }
                        catch (InvalidOperationException) { interfaceResult = new(false, Error: "interface_unavailable"); }
                        await SendAsync(new { type = "control.result", commandId = instruction.CommandId, result = interfaceResult }); break;
                    case "output.set":
                        var command = message.GetProperty("command").Deserialize<OutputCommand>(Protocol.Json) ?? throw new ArgumentException();
                        if (!float.IsFinite(command.Volume) || command.Volume is < 0 or > 1) throw new ArgumentException();
                        OutputResult result;
                        if (!Enabled) result = new(false, health().Volume, health().Muted, "device_paused");
                        else if (applied.Contains(command.CommandId))
                        { var current = health(); result = new(true, current.Volume, current.Muted); }
                        else
                        {
                            result = await output(command);
                            if (result.Applied) { if (applied.Count >= 128) applied.Clear(); applied.Add(command.CommandId); }
                        }
                        await SendAsync(new { type = "output.result", commandId = command.CommandId, result }); break;
                    case "alert":
                        var notice = message.GetProperty("alert").Deserialize<AlertNotice>(Protocol.Json) ?? throw new ArgumentException();
                        if (notice.Message.Length > 256 || notice.English.Length > 256 || notice.Severity is not ("info" or "warning" or "critical")) throw new ArgumentException();
                        if (notice.Code == "server.stopping") intentional = true;
                        if (noticed.Count >= 128) noticed.Clear();
                        if (noticed.Add(notice.Id)) Alert?.Invoke(notice); break;
                    default: throw new ArgumentException("서버 메시지를 확인할 수 없습니다.");
                }
            }
        }
        catch (Exception e) when (e is WebSocketException or OperationCanceledException or JsonException or ArgumentException or InvalidOperationException or KeyNotFoundException)
        { welcome.TrySetException(new InvalidOperationException("서버 연결을 확인할 수 없습니다.")); }
        finally
        {
            if (!intentional) Alert?.Invoke(new(Guid.NewGuid(), "server.offline", "critical", "서버 연결이 끊어졌습니다. 카메라 전송과 제어를 중지합니다.", "Server connection lost. Camera streaming and remote control have stopped.", true));
            socket.Abort(); stop.Cancel(); frameAck?.TrySetCanceled(); Activity?.Invoke("연결 종료됨");
        }
    }
    private async Task HeartbeatAsync()
    {
        using var timer = new PeriodicTimer(TimeSpan.FromSeconds(3));
        try
        {
            do { await SendAsync(new { type = "heartbeat", health = health() }); }
            while (await timer.WaitForNextTickAsync(stop.Token));
        }
        catch (Exception e) when (e is OperationCanceledException or WebSocketException) { }
    }
    public async ValueTask DisposeAsync()
    {
        intentional = true;
        if (Connected)
            try { await SendAsync(new { type = "bye" }); }
            catch (Exception e) when (e is WebSocketException or OperationCanceledException) { }
        stop.Cancel(); socket.Abort();
        await Task.WhenAll(receiver, heartbeat);
        socket.Dispose(); stop.Dispose();
    }
}
