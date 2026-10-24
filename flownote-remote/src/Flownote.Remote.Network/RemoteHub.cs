using System.Diagnostics;
using System.Net;
using System.Net.WebSockets;
using System.Security.Cryptography;
using System.Security.Cryptography.X509Certificates;
using System.Text.Json;
using Flownote.Remote.Core;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Http;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Logging;

namespace Flownote.Remote.Network;

public sealed class RemoteHub : IAsyncDisposable
{
    private sealed class Peer(DeviceGrant grant, WebSocket socket)
    {
        public DeviceGrant Grant { get; } = grant;
        public WebSocket Socket { get; } = socket;
        public SemaphoreSlim Writer { get; } = new(1);
        public GestureGate Gate { get; } = new(750);
        public long LastSeen = Environment.TickCount64, LastFrame;
        public float Volume = 0.7f;
        public bool Muted, CameraActive, Leaving, Participating = true, OutputReady = true, SpeakAlerts = true;
        public string Platform = "클라이언트";
        public int BatteryWarning, MemoryWarning;
        public float? DesiredVolume;
        public bool DesiredMuted;
        public readonly HashSet<Guid> PendingOutputs = [];
        public int? Battery;
        public readonly HashSet<Guid> Commands = [];
        public readonly Queue<Guid> CommandOrder = [];
    }
    private readonly object gate = new();
    private readonly Dictionary<Guid, DeviceGrant> grants;
    private readonly Dictionary<Guid, Peer> peers = [];
    private readonly Dictionary<string, (long Window, int Count)> attempts = [];
    private readonly Dictionary<string, long> alerts = [];
    private readonly Func<byte[], Task<GestureSample>> infer;
    private readonly HubCapabilities capabilities;
    private readonly CancellationTokenSource stop = new();
    private RemoteSettings settings;
    private WebApplication? app;
    private string pairCode = "";
    private long pairExpires, pairExpiresUtc;
    private Guid? gestureTarget, voiceTarget;
    public event Action? Changed;
    public event Action<IReadOnlyList<DeviceGrant>>? GrantsChanged;
    public event Action<string>? Activity;
    public string PairingCode { get { lock (gate) return pairCode; } }
    public string Address { get; private set; } = "";

    public RemoteHub(RemoteSettings settings, Func<byte[], Task<GestureSample>> infer, IEnumerable<DeviceGrant>? knownDevices = null,
        HubCapabilities? capabilities = null)
    {
        this.settings = RemoteSettings.Parse(settings.ToJson()); this.infer = infer;
        this.capabilities = (capabilities ?? new()) with { ClientParticipation = true };
        grants = (knownDevices ?? []).Take(8).ToDictionary(g => g.Id);
        RenewPairing();
    }

    public void RenewPairing()
    {
        lock (gate) { pairCode = RandomNumberGenerator.GetInt32(100000, 1000000).ToString(); pairExpires = Environment.TickCount64 + 120000; pairExpiresUtc = DateTimeOffset.UtcNow.ToUnixTimeSeconds() + 120; }
        Changed?.Invoke();
    }
    public PairingLink Invitation(string pin)
    { lock (gate) return new(Address, Protocol.NormalizePin(pin), pairCode, pairExpiresUtc); }
    public async Task SetDeviceAllowedAsync(Guid id, bool allowed)
    {
        lock (gate)
        {
            if (!grants.TryGetValue(id, out var grant)) return;
            grants[id] = grant with { Allowed = allowed };
            if (peers.TryGetValue(id, out var peer)) { peer.Gate.Reset(); if (!allowed) peer.CameraActive = false; }
            GrantsChanged?.Invoke(grants.Values.ToArray());
        }
        Changed?.Invoke(); await BroadcastStateAsync();
    }
    private bool Enabled(Peer peer) => grants.TryGetValue(peer.Grant.Id, out var grant) && grant.Allowed && peer.Participating;
    private async Task BroadcastStateAsync()
    {
        Peer[] clients; lock (gate) clients = peers.Values.ToArray();
        foreach (var peer in clients)
            try { await SendAsync(peer, new { type = "state", state = Snapshot() }); }
            catch (Exception e) when (e is WebSocketException or OperationCanceledException) { }
    }
    public void Configure(RemoteSettings value)
    {
        var copy = RemoteSettings.Parse(value.ToJson());
        lock (gate) { settings = copy; foreach (var p in peers.Values) p.Gate.Reset(); }
        Changed?.Invoke();
    }
    public void SelectTargets(Guid? commandTarget, Guid? speechTarget)
    { lock (gate) { gestureTarget = commandTarget; voiceTarget = speechTarget; } Changed?.Invoke(); }
    public HubState Snapshot()
    {
        lock (gate) return new(grants.Values.Select(g => peers.TryGetValue(g.Id, out var p)
            ? new DeviceState(g.Id, g.Name, true, p.CameraActive && Enabled(p), p.Volume, p.Muted, p.Battery, p.LastSeen,
                Enabled(p), g.Allowed, p.OutputReady, p.SpeakAlerts, p.Platform)
            : new DeviceState(g.Id, g.Name, false, false, 0, false, null, 0, false, g.Allowed, false, false)).ToArray(),
            gestureTarget, voiceTarget, settings.GesturesEnabled, capabilities);
    }
    public PairResult RegisterLocal(string name, Guid? deviceId = null)
    {
        PairResult result;
        lock (gate)
        {
            bool allowed = !deviceId.HasValue || !grants.TryGetValue(deviceId.Value, out var previous) || previous.Allowed;
            if (deviceId.HasValue) grants.Remove(deviceId.Value);
            if (grants.Count >= 8) throw new InvalidOperationException("등록된 기기는 최대 8대입니다. 사용하지 않는 기기를 해제하세요.");
            string token = Convert.ToHexString(RandomNumberGenerator.GetBytes(32));
            var record = new DeviceGrant(deviceId ?? Guid.NewGuid(), CleanName(name), Protocol.Hash(token), allowed);
            grants.Add(record.Id, record); result = new(record.Id, token);
            GrantsChanged?.Invoke(grants.Values.ToArray());
        }
        return result;
    }
    public void Revoke(Guid id)
    {
        Peer? peer;
        lock (gate) { grants.Remove(id); peers.TryGetValue(id, out peer); peer?.Socket.Abort(); GrantsChanged?.Invoke(grants.Values.ToArray()); }
    }
    public DeviceGrant[] RegisteredDevices() { lock (gate) return grants.Values.ToArray(); }

    public async Task StartAsync(IPAddress address, int port, X509Certificate2 certificate)
    {
        if (!Protocol.IsPrivate(address) || port is < 0 or > 65535) throw new ArgumentException("사설/VPN 주소를 선택하세요.");
        if (app is not null) throw new InvalidOperationException("이미 서버가 실행 중입니다.");
        var builder = WebApplication.CreateSlimBuilder();
        builder.Logging.ClearProviders();
        builder.WebHost.ConfigureKestrel(k => { k.Limits.MaxRequestBodySize = 2048; k.Listen(address, port, l => l.UseHttps(certificate)); });
        builder.Services.ConfigureHttpJsonOptions(o => o.SerializerOptions.PropertyNamingPolicy = JsonNamingPolicy.CamelCase);
        var application = builder.Build();
        application.UseWebSockets(new WebSocketOptions { KeepAliveInterval = TimeSpan.FromSeconds(5) });
        application.MapPost("/v1/pair", (Delegate)PairAsync);
        application.Map("/v1/session", ConnectAsync);
        await application.StartAsync(stop.Token);
        app = application; Address = application.Urls.First();
        _ = MonitorAsync(); Changed?.Invoke();
    }

    private async Task<IResult> PairAsync(HttpContext context)
    {
        string ip = context.Connection.RemoteIpAddress?.ToString() ?? "unknown";
        lock (gate)
        {
            long now = Environment.TickCount64;
            if (!attempts.TryGetValue(ip, out var rate) || now - rate.Window > 60000) rate = (now, 0);
            if (attempts.Count >= 128 && !attempts.ContainsKey(ip))
            {
                foreach (var key in attempts.Where(a => now - a.Value.Window > 60000).Select(a => a.Key).ToArray()) attempts.Remove(key);
                if (attempts.Count >= 128) return Results.StatusCode(429);
            }
            attempts[ip] = (rate.Window, rate.Count + 1);
            if (rate.Count >= 5) return Results.StatusCode(429);
        }
        if (!context.Request.HasJsonContentType()) return Results.BadRequest();
        PairRequest? request;
        try { request = await context.Request.ReadFromJsonAsync<PairRequest>(Protocol.Json, context.RequestAborted); }
        catch (Exception e) when (e is JsonException or BadHttpRequestException) { return Results.BadRequest(); }
        if (request is null || request.Code is null || request.Name is null) return Results.BadRequest();
        try { _ = CleanName(request.Name); } catch (ArgumentException) { return Results.BadRequest(); }
        lock (gate)
        {
            if (Environment.TickCount64 > pairExpires || request.Code.Length != 6 || request.Code != pairCode) return Results.Unauthorized();
            if (grants.Count >= 8) return Results.StatusCode(409);
            pairExpires = 0;
        }
        var result = RegisterLocal(request.Name); RenewPairing();
        return Results.Json(result, Protocol.Json);
    }

    private async Task ConnectAsync(HttpContext context)
    {
        string header = context.Request.Headers.Authorization.ToString();
        DeviceGrant? grant = null;
        if (header.StartsWith("Bearer ", StringComparison.Ordinal) && header.Length == 71)
        {
            string supplied = Protocol.Hash(header[7..]);
            lock (gate) grant = grants.Values.FirstOrDefault(g => CryptographicOperations.FixedTimeEquals(
                System.Text.Encoding.ASCII.GetBytes(g.TokenHash), System.Text.Encoding.ASCII.GetBytes(supplied)));
        }
        if (grant is null) { context.Response.StatusCode = 401; return; }
        if (!context.WebSockets.IsWebSocketRequest) { context.Response.StatusCode = 400; return; }
        using var socket = await context.WebSockets.AcceptWebSocketAsync();
        var peer = new Peer(grant, socket);
        lock (gate)
        {
            if (!grants.TryGetValue(grant.Id, out var active) || active.TokenHash != grant.TokenHash) { socket.Abort(); return; }
            if (peers.TryGetValue(grant.Id, out var old)) old.Socket.Abort();
            peers[grant.Id] = peer; gestureTarget ??= grant.Id; voiceTarget ??= grant.Id;
        }
        try
        {
            await SendAsync(peer, new { type = "welcome", deviceId = grant.Id, state = Snapshot() });
            Activity?.Invoke($"{grant.Name} 연결됨"); Changed?.Invoke();
            while (!stop.IsCancellationRequested && socket.State == WebSocketState.Open)
            {
                using var doc = await SocketJson.ReceiveAsync(socket, stop.Token);
                if (doc is null) break;
                peer.LastSeen = Environment.TickCount64;
                await HandleAsync(peer, doc.RootElement);
            }
        }
        catch (Exception e) when (e is WebSocketException or OperationCanceledException or JsonException or ArgumentException or InvalidOperationException or FormatException or KeyNotFoundException)
        { Activity?.Invoke($"{grant.Name} 연결 종료"); }
        finally
        {
            bool removed;
            lock (gate)
            {
                removed = peers.TryGetValue(grant.Id, out var current) && ReferenceEquals(current, peer);
                if (removed) { peers.Remove(grant.Id); if (voiceTarget == grant.Id) voiceTarget = peers.Keys.Cast<Guid?>().FirstOrDefault(); }
            }
            if (removed && !stop.IsCancellationRequested && !peer.Leaving)
                await AnnounceAsync("device.offline:" + grant.Id, "warning", $"{grant.Name}의 연결이 끊어졌습니다.", "A client has disconnected.");
            Changed?.Invoke();
        }
    }

    private async Task HandleAsync(Peer peer, JsonElement message)
    {
        string? type = message.GetProperty("type").GetString();
        switch (type)
        {
            case "device.enabled":
                lock (gate) { peer.Participating = message.GetProperty("enabled").GetBoolean(); peer.Gate.Reset(); if (!Enabled(peer)) peer.CameraActive = false; }
                await BroadcastStateAsync(); Changed?.Invoke(); break;
            case "heartbeat":
                var health = message.GetProperty("health").Deserialize<HealthSample>(Protocol.Json) ?? throw new ArgumentException();
                if (!float.IsFinite(health.Volume) || health.Volume is < 0 or > 1 || health.BatteryPercent is < 0 or > 100 || health.MemoryLoadPercent is < 0 or > 100) throw new ArgumentException();
                bool warn, memory;
                lock (gate)
                {
                    peer.Volume = health.Volume; peer.Muted = health.Muted; peer.Battery = health.BatteryPercent;
                    peer.OutputReady = health.OutputReady; peer.SpeakAlerts = health.SpeakAlerts;
                    peer.Platform = health.Platform is "Windows" or "Android" ? health.Platform : "클라이언트";
                    int batteryLevel = health.BatteryPercent is <= 5 ? 2 : health.BatteryPercent is <= 15 ? 1 : 0;
                    int memoryLevel = health.MemoryLoadPercent is >= 97 ? 2 : health.MemoryLoadPercent is >= 90 ? 1 : 0;
                    warn = batteryLevel > peer.BatteryWarning;
                    if (health.BatteryPercent is >= 20 || warn) peer.BatteryWarning = batteryLevel;
                    memory = memoryLevel > peer.MemoryWarning;
                    if (health.MemoryLoadPercent is <= 80 || memory) peer.MemoryWarning = memoryLevel;
                }
                if (warn) await AnnounceAsync("battery.low:" + peer.Grant.Id + (health.BatteryPercent <= 5 ? ":critical" : ""), health.BatteryPercent <= 5 ? "critical" : "warning", $"{peer.Grant.Name}의 배터리가 부족합니다.", "A client battery is low.");
                if (memory) await AnnounceAsync("memory.high:" + peer.Grant.Id + (health.MemoryLoadPercent >= 97 ? ":critical" : ""), health.MemoryLoadPercent >= 97 ? "critical" : "warning", $"{peer.Grant.Name}의 메모리 사용량이 높습니다.", "A computer is running low on available memory.");
                if (!health.OutputReady) await AnnounceAsync("output.error:" + peer.Grant.Id, "warning", $"{peer.Grant.Name}의 소리 출력 장치를 사용할 수 없습니다.", "A client's audio output device is unavailable.");
                await SendAsync(peer, new { type = "state", state = Snapshot() }); Changed?.Invoke(); break;
            case "command":
                var id = message.GetProperty("commandId").GetGuid();
                lock (gate)
                {
                    if (!Enabled(peer)) return;
                    if (!peer.Commands.Add(id)) return;
                    peer.CommandOrder.Enqueue(id);
                    if (peer.CommandOrder.Count > 128) peer.Commands.Remove(peer.CommandOrder.Dequeue());
                }
                await ExecuteAsync(message.GetProperty("targetId").GetGuid(), message.GetProperty("action").GetString() ?? "", id); break;
            case "output.result":
                var output = message.GetProperty("result").Deserialize<OutputResult>(Protocol.Json) ?? throw new ArgumentException();
                if (!float.IsFinite(output.Volume) || output.Volume is < 0 or > 1) throw new ArgumentException();
                lock (gate)
                {
                    if (!peer.PendingOutputs.Remove(message.GetProperty("commandId").GetGuid())) return;
                    if (output.Applied) { peer.Volume = output.Volume; peer.Muted = output.Muted; }
                    if (peer.PendingOutputs.Count == 0) peer.DesiredVolume = null;
                }
                if (!output.Applied) await AnnounceAsync("output.error:" + peer.Grant.Id, "warning", $"{peer.Grant.Name}의 소리 출력 장치를 확인하세요.", "Please check the client's audio output device.");
                Activity?.Invoke(output.Applied ? $"{peer.Grant.Name} 소리 제어 적용됨" : $"{peer.Grant.Name} 소리 제어 실패"); Changed?.Invoke(); break;
            case "camera.frame":
                Guid frameId = message.GetProperty("frameId").GetGuid();
                bool enabled; lock (gate) enabled = Enabled(peer);
                if (!enabled) { await SendAsync(peer, new { type = "frame.result", frameId, gesture = "None", confidence = 0 }); return; }
                if (Environment.TickCount64 - peer.LastFrame < 180) { await SendAsync(peer, new { type = "frame.result", frameId, gesture = "None", confidence = 0 }); return; }
                peer.LastFrame = Environment.TickCount64; peer.CameraActive = true;
                string encoded = message.GetProperty("jpeg").GetString() ?? "";
                if (encoded.Length > 180000) throw new ArgumentException();
                byte[] frame = Convert.FromBase64String(encoded); Protocol.ValidateJpeg(frame);
                GestureSample sample;
                try { sample = await infer(frame).WaitAsync(TimeSpan.FromSeconds(4), stop.Token); }
                catch (Exception e) when (e is TimeoutException or InvalidOperationException)
                {
                    await AnnounceAsync("vision.unavailable", "warning", "서버의 카메라 분석을 사용할 수 없습니다.", "Server gesture recognition is unavailable.");
                    sample = new(null, 0);
                }
                string? action; Guid? target;
                lock (gate) { action = Enabled(peer) ? peer.Gate.Observe(settings, sample.Gesture, sample.Confidence, Environment.TickCount64) : null; target = gestureTarget; }
                await SendAsync(peer, new { type = "frame.result", frameId, gesture = sample.Gesture, confidence = sample.Confidence });
                if (action is not null && target.HasValue && action != "assistant_open") await ExecuteAsync(target.Value, action, Guid.NewGuid());
                if (action == "assistant_open") await AnnounceAsync("assistant.pending", "info", "자연어 비서는 아직 연결되지 않았습니다.", "The conversational assistant is not connected yet.");
                Changed?.Invoke(); break;
            case "camera.stop": lock (gate) { peer.CameraActive = false; peer.Gate.Reset(); } Changed?.Invoke(); break;
            case "bye": peer.Leaving = true; break;
            default: throw new ArgumentException("지원하지 않는 명령입니다.");
        }
    }

    public async Task ExecuteAsync(Guid target, string action, Guid commandId)
    {
        Peer? peer; float volume; bool muted;
        lock (gate)
        {
            if (!peers.TryGetValue(target, out peer)) return;
            if (!Enabled(peer)) return;
            if (peer.PendingOutputs.Count >= 128) throw new InvalidOperationException("출력 응답을 기다리고 있습니다.");
            volume = peer.DesiredVolume ?? peer.Volume; muted = peer.DesiredVolume.HasValue ? peer.DesiredMuted : peer.Muted;
            switch (action)
            {
                case "volume_up": volume = Math.Min(1, volume + settings.VolumeStep); break;
                case "volume_down": volume = Math.Max(0, volume - settings.VolumeStep); break;
                case "mute": muted = true; break;
                case "unmute": muted = false; break;
                default: throw new ArgumentException("허용되지 않은 동작입니다.");
            }
            peer.DesiredVolume = volume; peer.DesiredMuted = muted; peer.PendingOutputs.Add(commandId);
        }
        await SendAsync(peer, new { type = "output.set", command = new OutputCommand(commandId, volume, muted) });
    }

    public async Task AnnounceAsync(string code, string severity, string message, string english)
    {
        Peer[] clients; Guid? voice;
        lock (gate)
        {
            long now = Environment.TickCount64;
            if (alerts.TryGetValue(code, out long previous) && now - previous < 30000) return;
            if (alerts.Count > 128) alerts.Clear(); alerts[code] = now;
            clients = peers.Values.ToArray(); voice = voiceTarget is Guid voiceId && peers.TryGetValue(voiceId, out var target) && Enabled(target) && target.SpeakAlerts ? voiceTarget : null;
        }
        Guid id = Guid.NewGuid();
        foreach (var client in clients)
            try { await SendAsync(client, new { type = "alert", alert = new AlertNotice(id, code, severity, message, english, voice == client.Grant.Id) }); }
            catch (Exception e) when (e is WebSocketException or OperationCanceledException) { }
        Activity?.Invoke(message);
    }

    private async Task MonitorAsync()
    {
        using var timer = new PeriodicTimer(TimeSpan.FromSeconds(2));
        try
        {
            while (await timer.WaitForNextTickAsync(stop.Token))
            {
                lock (gate) foreach (var peer in peers.Values)
                    if (Environment.TickCount64 - peer.LastSeen > 12000) peer.Socket.Abort();
            }
        }
        catch (OperationCanceledException) { }
    }
    private Task SendAsync(Peer peer, object message) => SocketJson.SendAsync(peer.Socket, peer.Writer, message, stop.Token);
    private static string CleanName(string name)
    {
        name = name.Trim();
        if (name.Length is < 1 or > 32 || name.Any(c => char.IsControl(c))) throw new ArgumentException("기기 이름은 1–32자입니다.");
        return name;
    }
    public async ValueTask DisposeAsync()
    {
        if (app is null) return;
        await AnnounceAsync("server.stopping", "info", "서버가 종료됩니다.", "The server is stopping.");
        stop.Cancel(); lock (gate) foreach (var peer in peers.Values) peer.Socket.Abort();
        using var timeout = new CancellationTokenSource(TimeSpan.FromSeconds(3));
        await app.StopAsync(timeout.Token); await app.DisposeAsync(); app = null; stop.Dispose();
    }
}
