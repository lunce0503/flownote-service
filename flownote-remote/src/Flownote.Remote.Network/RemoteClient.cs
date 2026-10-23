using System.Net.Http.Json;
using System.Net.WebSockets;
using System.Text.Json;

namespace Flownote.Remote.Network;

public sealed class RemoteClient : IAsyncDisposable
{
    private readonly ClientWebSocket socket = new();
    private readonly SemaphoreSlim writer = new(1), frameGate = new(1);
    private readonly CancellationTokenSource stop = new();
    private readonly Func<OutputCommand, Task<OutputResult>> output;
    private readonly Func<HealthSample> health;
    private readonly HashSet<Guid> applied = [], noticed = [];
    private TaskCompletionSource<bool>? frameAck;
    private Guid pendingFrame;
    private readonly TaskCompletionSource<bool> welcome = new(TaskCreationOptions.RunContinuationsAsynchronously);
    private Task receiver = Task.CompletedTask, heartbeat = Task.CompletedTask;
    private bool intentional;
    public Guid DeviceId { get; private set; }
    public bool Connected => socket.State == WebSocketState.Open;
    public event Action<HubState>? StateChanged;
    public event Action<AlertNotice>? Alert;
    public event Action<string>? Activity;
    public event Action<GestureSample>? Gesture;

    public RemoteClient(Func<OutputCommand, Task<OutputResult>> output, Func<HealthSample> health)
    { this.output = output; this.health = health; }

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
    public async Task SendCameraAsync(byte[] jpeg)
    {
        Protocol.ValidateJpeg(jpeg);
        if (!Connected || !await frameGate.WaitAsync(0)) return;
        try
        {
            frameAck = new(TaskCreationOptions.RunContinuationsAsynchronously);
            pendingFrame = Guid.NewGuid();
            await SendAsync(new { type = "camera.frame", frameId = pendingFrame, jpeg = Convert.ToBase64String(jpeg) });
            await frameAck.Task.WaitAsync(TimeSpan.FromSeconds(6), stop.Token);
        }
        finally { frameAck = null; frameGate.Release(); }
    }
    public Task StopCameraAsync() => SendAsync(new { type = "camera.stop" });
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
                        welcome.TrySetResult(true); Activity?.Invoke("서버 연결됨");
                        StateChanged?.Invoke(message.GetProperty("state").Deserialize<HubState>(Protocol.Json)!); break;
                    case "state": StateChanged?.Invoke(message.GetProperty("state").Deserialize<HubState>(Protocol.Json)!); break;
                    case "frame.result":
                        if (message.GetProperty("frameId").GetGuid() != pendingFrame) break;
                        Gesture?.Invoke(new(message.GetProperty("gesture").GetString(), message.GetProperty("confidence").GetDouble()));
                        frameAck?.TrySetResult(true); break;
                    case "output.set":
                        var command = message.GetProperty("command").Deserialize<OutputCommand>(Protocol.Json) ?? throw new ArgumentException();
                        if (!float.IsFinite(command.Volume) || command.Volume is < 0 or > 1) throw new ArgumentException();
                        OutputResult result;
                        if (applied.Contains(command.CommandId))
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
