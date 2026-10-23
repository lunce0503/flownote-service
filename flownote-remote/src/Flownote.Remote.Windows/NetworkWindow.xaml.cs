using System.Net;
using System.Net.NetworkInformation;
using System.Net.Sockets;
using System.Security.Cryptography.X509Certificates;
using System.Windows;
using System.Windows.Controls;
using Flownote.Remote.Core;
using Flownote.Remote.Network;

namespace Flownote.Remote.Windows;

public partial class NetworkWindow : Window
{
    private readonly Func<RemoteSettings> readSettings;
    private readonly VisionHost vision = new();
    private readonly AssistantVoice voice = new();
    private RemoteHub? hub;
    private RemoteClient? client;
    private X509Certificate2? certificate;
    private SavedConnection? saved;
    private bool loaded, closing, closed;
    public NetworkWindow(Func<RemoteSettings> readSettings)
    {
        InitializeComponent(); this.readSettings = readSettings; CameraHost.Content = vision.View;
        DeviceName.Text = Environment.MachineName;
        BindAddress.ItemsSource = NetworkInterface.GetAllNetworkInterfaces().Where(n => n.OperationalStatus == OperationalStatus.Up)
            .SelectMany(n => n.GetIPProperties().UnicastAddresses).Select(a => a.Address)
            .Where(a => a.AddressFamily == AddressFamily.InterNetwork && Protocol.IsPrivate(a) && !IPAddress.IsLoopback(a)).Select(a => a.ToString()).Distinct().ToArray();
        BindAddress.SelectedIndex = 0;
        try { saved = PrivateStore.Load<SavedConnection>("client"); if (saved is not null) { ServerUrl.Text = saved.Address; ServerPin.Text = saved.Pin; } }
        catch (Exception) { Log("저장된 연결을 읽지 못했습니다. 새 코드로 다시 등록하세요."); }
        voice.Activity += Log;
        vision.Activity += Log;
        vision.CameraFrame += async frame =>
        {
            if (client?.Connected != true) return;
            try { await client.SendCameraAsync(frame); }
            catch (Exception e) when (e is OperationCanceledException or TimeoutException or System.Net.WebSockets.WebSocketException or InvalidOperationException) { Log("영상 전송 응답을 확인할 수 없습니다."); }
        };
        Loaded += async (_, _) =>
        {
            try { await vision.InitializeAsync(); loaded = true; Log("카메라 입력 준비됨 · 서버 시작 시 인식 모델을 불러옵니다."); }
            catch (Exception) { Log("카메라 분석 준비 실패: WebView2 Runtime 설치와 영상 자산을 확인하세요."); }
        };
        Closing += async (_, e) => { if (closed) return; e.Cancel = true; if (closing) return; closing = true; IsEnabled = false;
            try { await StopAllAsync(); } catch (Exception) { Log("연결 종료 처리 중 오류가 발생했습니다."); }
            finally { vision.Dispose(); voice.Dispose(); closed = true; Close(); } };
    }
    private void Log(string message)
    {
        if (!Dispatcher.CheckAccess()) { Dispatcher.BeginInvoke(() => Log(message)); return; }
        if (Events.Text.Length > 8000) Events.Text = Events.Text[^4000..];
        Events.AppendText(message + Environment.NewLine); Events.ScrollToEnd();
    }
    private async Task Guard(Func<Task> action)
    { try { await action(); } catch (Exception) { Log("요청 실패: 연결 상태·권한·서버 주소와 지문을 확인하세요."); } }
    private RemoteSettings ServerSettings()
    { var settings = readSettings(); settings.GesturesEnabled = AllowGestures.IsChecked == true; return settings; }
    private async void StartServer_Click(object sender, RoutedEventArgs e) => await Guard(async () =>
    {
        if (!loaded || hub is not null || BindAddress.SelectedItem is not string address) { Log("카메라 분석 준비 및 서버 IP 선택을 확인하세요."); return; }
        StartServer.IsEnabled = false;
        string stage = "인식 모델 준비";
        try
        {
            await DisconnectAsync(); await vision.LoadModelAsync();
            stage = "서버 인증서 저장";
            certificate = PrivateStore.Certificate(address);
            stage = "서버 설정 및 등록 기기 복원";
            hub = new RemoteHub(ServerSettings(), vision.InferAsync, PrivateStore.Load<DeviceGrant[]>("devices"));
            hub.Activity += Log;
            hub.Changed += () => Dispatcher.BeginInvoke(RefreshServer);
            hub.GrantsChanged += grants => PrivateStore.Save("devices", grants);
            stage = "서버 포트 열기";
            await hub.StartAsync(IPAddress.Parse(address), Protocol.Port, certificate);
            stage = "서버 PC 입출력 연결";
            var local = hub.RegisterLocal("서버 PC", Guid.Empty);
            await AttachAsync(hub.Address, Protocol.Pin(certificate), local);
            RefreshServer(); Log("서버 시작됨 · 로컬 카메라도 클라이언트 입력으로 연결했습니다.");
        }
        catch (Exception error) { Log($"서버 시작 실패: {stage} ({error.GetType().Name})"); if (hub is not null) { await hub.DisposeAsync(); hub = null; } StartServer.IsEnabled = true; throw; }
    });
    private void RefreshServer()
    {
        if (hub is null) return;
        ServerDetails.Text = $"주소: {hub.Address}\n인증서 지문: {Protocol.Pin(certificate!)}\n등록 코드: {hub.PairingCode} (2분·1회용)";
        RefreshDevices(hub.Snapshot());
        var selected = Registered.SelectedValue; Registered.ItemsSource = hub.RegisteredDevices(); Registered.SelectedValue = selected;
    }
    private void RefreshDevices(HubState state)
    {
        Guid? target = Target.SelectedValue as Guid? ?? state.GestureTarget;
        Guid? speech = VoiceTarget.SelectedValue as Guid? ?? state.VoiceTarget;
        Target.ItemsSource = state.Devices; VoiceTarget.ItemsSource = state.Devices;
        Target.SelectedValue = target; VoiceTarget.SelectedValue = speech;
    }
    private async Task AttachAsync(string address, string pin, PairResult grant)
    {
        client = new RemoteClient(NativeOutput.ApplyAsync, NativeOutput.Health);
        client.Activity += message => { Log(message); if (client?.Connected != true) Dispatcher.BeginInvoke(async () => { if (!closed && !closing) await vision.StopCameraAsync(); }); };
        client.Alert += alert => Dispatcher.BeginInvoke(() => { voice.Enabled = SpeakAlerts.IsChecked == true; voice.Speak(alert); });
        client.StateChanged += state => Dispatcher.BeginInvoke(() => RefreshDevices(state));
        client.Gesture += sample => Dispatcher.BeginInvoke(() => Detection.Text = $"서버 판정: {sample.Gesture ?? "손 없음"} · {sample.Confidence:P0}");
        await client.ConnectAsync(address, pin, grant);
    }
    private async void Connect_Click(object sender, RoutedEventArgs e) => await Guard(async () =>
    {
        if (hub is not null) { Log("이 기기는 서버 모드입니다. 서버를 중지한 뒤 다른 서버에 연결하세요."); return; }
        if (PinConfirmed.IsChecked != true) { Log("서버 화면의 주소와 지문을 먼저 대조하세요."); return; }
        string address = Protocol.ServerUri(ServerUrl.Text.Trim()).ToString(), pin = Protocol.NormalizePin(ServerPin.Text);
        var grant = saved?.Address == address && saved.Pin == pin && PairCode.Password.Length == 0 ? saved.Grant
            : await RemoteClient.PairAsync(address, pin, PairCode.Password, DeviceName.Text);
        await DisconnectAsync(); await AttachAsync(address, pin, grant);
        saved = new(address, pin, grant); PrivateStore.Save("client", saved); PairCode.Clear();
    });
    private async Task DisconnectAsync()
    { await vision.StopCameraAsync(); if (client is not null) { var old = client; client = null; await old.DisposeAsync(); } }
    private async Task StopAllAsync()
    {
        if (hub is not null) await hub.AnnounceAsync("server.stopping", "info", "서버가 종료됩니다.", "The server is stopping.");
        await DisconnectAsync(); if (hub is not null) { await hub.DisposeAsync(); hub = null; }
        certificate?.Dispose(); certificate = null; StartServer.IsEnabled = true; ServerDetails.Text = "서버 꺼짐";
    }
    private async void Stop_Click(object sender, RoutedEventArgs e) => await Guard(StopAllAsync);
    private async void Disconnect_Click(object sender, RoutedEventArgs e) => await Guard(DisconnectAsync);
    private void Pair_Click(object sender, RoutedEventArgs e) { hub?.RenewPairing(); RefreshServer(); }
    private void Configure_Click(object sender, RoutedEventArgs e) { hub?.Configure(ServerSettings()); RefreshServer(); }
    private void Targets_Click(object sender, RoutedEventArgs e) { hub?.SelectTargets(Target.SelectedValue as Guid?, VoiceTarget.SelectedValue as Guid?); }
    private void Revoke_Click(object sender, RoutedEventArgs e)
    { if (Registered.SelectedValue is Guid id && id != Guid.Empty) { hub?.Revoke(id); RefreshServer(); } }
    private async void Command_Click(object sender, RoutedEventArgs e) => await Guard(async () =>
    { if (client?.Connected == true && Target.SelectedValue is Guid target) await client.CommandAsync(target, (string)((Button)sender).Tag); else Log("제어할 기기를 연결하세요."); });
    private async void Camera_Click(object sender, RoutedEventArgs e) => await Guard(async () =>
    { if (!loaded || client?.Connected != true) { Log("서버에 연결한 뒤 카메라를 시작하세요."); return; } await vision.StartCameraAsync(); });
    private async void CameraStop_Click(object sender, RoutedEventArgs e) => await Guard(async () =>
    { await vision.StopCameraAsync(); if (client?.Connected == true) await client.StopCameraAsync(); Detection.Text = "카메라 꺼짐"; });
}
