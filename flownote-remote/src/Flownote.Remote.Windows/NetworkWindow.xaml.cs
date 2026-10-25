using System.Collections.ObjectModel;
using System.IO;
using System.Net;
using System.Net.NetworkInformation;
using System.Net.Sockets;
using System.Security.Cryptography.X509Certificates;
using System.Windows;
using System.Windows.Controls;
using System.Windows.Controls.Primitives;
using System.Windows.Threading;
using Flownote.Remote.Core;
using Flownote.Remote.Network;

namespace Flownote.Remote.Windows;

public partial class NetworkWindow : Window
{
    private readonly Func<RemoteSettings> readSettings;
    private readonly VisionHost vision = new();
    private readonly AssistantVoice voice = new();
    private readonly ObservableCollection<ClientRow> rows = [];
    private readonly string[] addresses;
    private readonly string settingsPath = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "Flownote", "Remote", "settings.json");
    private RemoteHub? hub;
    private RemoteClient? client;
    private X509Certificate2? certificate;
    private SavedConnection? saved;
    private HubState? state;
    private Guid? target;
    private string? bindAddress;
    private string history = "";
    private bool loaded, closing, closed, scanningQr, refreshing;
    private volatile bool speakEnabled = true;
    private int scanBusy;
    private long rejectedQr;
    private Window? connectionDialog, invitationDialog;
    private PairingLink? imported;
    private TextBox? serverUrl, serverPin, deviceName;
    private PasswordBox? pairCode;
    private CheckBox? pinConfirmed;

    public NetworkWindow() : this(null) { }
    public NetworkWindow(Func<RemoteSettings>? settings)
    {
        InitializeComponent();
        var work = SystemParameters.WorkArea;
        MinWidth = Math.Min(MinWidth, work.Width); MinHeight = Math.Min(MinHeight, work.Height);
        Width = Math.Min(Width, work.Width); Height = Math.Min(Height, work.Height); WindowStartupLocation = WindowStartupLocation.CenterScreen;
        SizeChanged += (_, _) => FeatureGrid.Columns = ActualWidth >= 740 ? 2 : 1;
        readSettings = settings ?? (() => File.Exists(settingsPath) ? RemoteSettings.Parse(File.ReadAllText(settingsPath)) : RemoteSettings.Defaults());
        try { cameraPreference = PrivateStore.Load<CameraPreference>("camera") ?? new(readSettings().CameraFacing,null); } catch { cameraPreference = new("front",null); }
        CameraHost.Content = vision.View; ClientList.ItemsSource = rows; StartServer.IsEnabled = false;
        RecentNotice.Text = "카메라 입력을 준비하고 있어요…";
        addresses = NetworkInterface.GetAllNetworkInterfaces().Where(n => n.OperationalStatus == OperationalStatus.Up)
            .SelectMany(n => n.GetIPProperties().UnicastAddresses).Select(a => a.Address)
            .Where(a => a.AddressFamily == AddressFamily.InterNetwork && Protocol.IsPrivate(a) && !IPAddress.IsLoopback(a))
            .Select(a => a.ToString()).Distinct().ToArray();
        bindAddress = addresses.FirstOrDefault(); AllowGestures.IsEnabled = false;
        try { saved = PrivateStore.Load<SavedConnection>("client"); }
        catch (Exception) { Log("저장된 연결을 읽지 못했습니다. 새 QR로 다시 등록하세요."); }
        voice.Activity += Log; vision.Activity += message => { Log(message); if (message.StartsWith("카메라 권한", StringComparison.Ordinal)) _ = Guard(StopCameraAsync); };
        vision.CameraFrame += async frame =>
        {
            if (closing || closed) return;
            if (scanningQr)
            {
                if (Interlocked.Exchange(ref scanBusy, 1) != 0) return;
                try
                {
                    string? text = await Task.Run(() => QrCode.Decode(frame));
                    if (!scanningQr || closing || text is null) return;
                    PairingLink link;
                    try { link = PairingLink.Parse(text); }
                    catch (ArgumentException) { if (Environment.TickCount64 - rejectedQr > 4000) { Log("Flownote의 유효한 연결 QR을 읽어 주세요."); rejectedQr = Environment.TickCount64; } return; }
                    await StopCameraAsync(); OpenConnection(link);
                }
                catch (Exception) { Log("QR을 읽지 못했습니다. 연결 코드 붙여넣기도 사용할 수 있어요."); }
                finally { Interlocked.Exchange(ref scanBusy, 0); }
                return;
            }
        };
        vision.SkeletonFrame += async frame =>
        {
            if (closing || closed || scanningQr || client is not { Connected: true, Enabled: true }) return;
            try { await client.SendSkeletonAsync(frame); }
            catch (Exception error) when (error is OperationCanceledException or TimeoutException or System.Net.WebSockets.WebSocketException or InvalidOperationException or ArgumentException) { Log("골격 응답을 확인할 수 없습니다."); }
        };
        Loaded += async (_, _) =>
        {
            try { StartServer.IsEnabled = true; await vision.InitializeAsync(); loaded = true; StartServer.IsEnabled = true; Log("카메라 입력 준비됨 · 사용할 기능을 켜 주세요."); }
            catch (Exception) { StartServer.IsEnabled = true; Log("카메라 준비 실패: WebView2 Runtime 설치를 확인하세요. 서버와 수동 제어는 사용할 수 있습니다."); }
        };
        Closing += async (_, e) =>
        {
            if (closed) return; e.Cancel = true; if (closing) return; closing = true; IsEnabled = false;
            connectionDialog?.Close(); invitationDialog?.Close();
            try { await StopAllAsync(); } catch (Exception) { Log("연결 종료 중 오류가 발생했습니다."); }
            finally { vision.Dispose(); voice.Dispose(); closed = true; Close(); }
        };
    }
    private void Log(string message)
    {
        if (!Dispatcher.CheckAccess()) { Dispatcher.BeginInvoke(() => Log(message)); return; }
        if (closed) return;
        if (history.Length > 8000) history = history[^4000..];
        history += message + Environment.NewLine; RecentNotice.Text = message;
    }
    private async Task Guard(Func<Task> action)
    { try { await action(); } catch (Exception) { Log("요청 실패: 연결 상태와 권한을 확인해 주세요. 세부 연결 정보는 더 보기에서 확인할 수 있어요."); } }
    private RemoteSettings ServerSettings()
    { var settings = readSettings(); settings.GesturesEnabled = AllowGestures.IsChecked == true; return settings; }
    private async void StartServer_Click(object sender, RoutedEventArgs e) => await Guard(async () =>
    {
        if (hub is not null) return;
        if (bindAddress is null) { Log("연결된 사설망/VPN이 없습니다. 네트워크에 연결한 뒤 앱을 다시 열어 주세요."); return; }
        StartServer.IsEnabled = false; string stage = "인식 모델 준비";
        try
        {
            await DisconnectAsync();
            stage = "서버 인증서 저장"; certificate = PrivateStore.Certificate(bindAddress);
            stage = "설정 복원"; hub = new RemoteHub(ServerSettings(), knownDevices: PrivateStore.Load<DeviceGrant[]>("devices"));
            hub.Activity += Log; hub.Changed += () => Dispatcher.BeginInvoke(RefreshServer);
            hub.GrantsChanged += grants => PrivateStore.Save("devices", grants);
            stage = "서버 포트 열기"; await hub.StartAsync(IPAddress.Parse(bindAddress), Protocol.Port, certificate);
            stage = "서버 PC 입출력 연결"; var local = hub.RegisterLocal("이 PC", Guid.Empty);
            await AttachAsync(hub.Address, Protocol.Pin(certificate), local);
            RefreshServer(); Log("서버 시작됨 · 클라이언트 연결에서 QR을 보여 주세요.");
        }
        catch (Exception error)
        {
            Log($"서버 시작 실패: {stage} ({error.GetType().Name})");
            if (hub is not null) { await hub.DisposeAsync(); hub = null; }
            StartServer.IsEnabled = true; throw;
        }
    });
    private void RefreshServer() { if (hub is not null && !closing) RefreshDevices(hub.Snapshot()); }
    private void RefreshDevices(HubState value)
    {
        if (closing || closed) return; state = value;
        refreshing = true;
        try {
        foreach (var row in rows.Where(r => !value.Devices.Any(d => d.Id == r.Id)).ToArray()) rows.Remove(row);
        foreach (var device in value.Devices)
        {
            var row = rows.FirstOrDefault(r => r.Id == device.Id);
            if (row is null) { row = new(device.Id); rows.Add(row); }
            row.Update(device, value, hub is not null, client?.DeviceId);
        }
        if (!value.Devices.Any(d => d.Id == target && d.Connected && d.Enabled))
            target = value.Devices.FirstOrDefault(d => d.Id == value.GestureTarget && d.Connected && d.Enabled)?.Id
                ?? value.Devices.FirstOrDefault(d => d.Connected && d.Enabled)?.Id;
        var output = value.Devices.FirstOrDefault(d => d.Id == target && d.Connected);
        SoundSummary.Text = output is null ? "목록의 더 보기에서 제어할 기기를 선택하세요." : $"{output.Name} · {(!output.OutputReady ? "출력 장치 확인 필요" : output.Muted ? "음소거" : output.Volume.ToString("P0"))}";
        MuteControl.Content = output?.Muted == true ? "음소거 해제" : "음소거";
        int count = value.Devices.Count(d => d.Connected); ClientsTitle.Text = $"클라이언트 · {count}대 연결";
        EmptyClients.Visibility = rows.Count == 0 ? Visibility.Visible : Visibility.Collapsed;
        ConnectionStatus.Text = hub is not null ? $"이 PC가 서버입니다 · {count}대 연결됨" : $"서버에 연결됨 · {count}대 참여 중";
        AllowGestures.IsEnabled = hub is not null; AllowGestures.IsChecked = value.GesturesEnabled;
        GestureSummary.Text = value.GesturesEnabled ? "제스처 명령 사용 중" : "꺼짐 · 켜면 손 모양으로 제어합니다.";
        RefreshScopedState(value);
        if (client is not null && value.Devices.Any(d => d.Id == client.DeviceId && !d.Enabled))
            _ = Guard(StopCameraAsync);
        } finally { refreshing = false; }
    }
    private async Task AttachAsync(string address, string pin, PairResult grant)
    {
        var attached = new RemoteClient(NativeOutput.ApplyAsync, () => NativeOutput.Health() with { SpeakAlerts = speakEnabled, Platform = "Windows" }, ApplyInterfaceAsync);
        client = attached;
        attached.Activity += message =>
        {
            Log(message);
            if (!attached.Connected) Dispatcher.BeginInvoke(async () => { if (!closed && !closing && ReferenceEquals(client, attached)) { await Guard(StopCameraAsync); ClearScopedState(); ConnectionStatus.Text = "연결이 끊겼습니다. 서버에 다시 연결해 주세요."; } });
        };
        attached.Alert += alert => Dispatcher.BeginInvoke(() => { if (!closing && ReferenceEquals(client, attached)) { voice.Enabled = speakEnabled; voice.Speak(alert); } });
        attached.StateChanged += value => Dispatcher.BeginInvoke(() => { if (ReferenceEquals(client, attached)) RefreshDevices(value); });
        attached.Gesture += sample => Dispatcher.BeginInvoke(() => { if (ReferenceEquals(client, attached)) Detection.Text = sample.Gesture == "Tracking" ? "골격 추적 중 · 원본 영상은 이 기기에만 유지" : sample.Gesture is "None" or null ? "손과 상체를 카메라에 보여 주세요." : sample.Gesture; });
        await attached.ConnectAsync(address, pin, grant);
    }
    private async Task DisconnectAsync()
    {
        await StopCameraAsync();
        if (client is not null) { var previous = client; client = null; await previous.DisposeAsync(); }
        rows.Clear(); state = null; target = null; EmptyClients.Visibility = Visibility.Visible;
        ClearScopedState();
        ClientsTitle.Text = "클라이언트"; SoundSummary.Text = "클라이언트를 연결해 주세요."; ConnectionStatus.Text = "연결 안 됨";
    }
    private async Task StopAllAsync()
    {
        if (hub is not null) await hub.AnnounceAsync("server.stopping", "info", "서버가 종료됩니다.", "The server is stopping.");
        await DisconnectAsync(); if (hub is not null) { await hub.DisposeAsync(); hub = null; }
        certificate?.Dispose(); certificate = null; StartServer.IsEnabled = true; AllowGestures.IsEnabled = false;
        refreshing = true; AllowGestures.IsChecked = false; refreshing = false;
        rows.Clear(); state = null; target = null; EmptyClients.Visibility = Visibility.Visible;
        ConnectionStatus.Text = "서버가 꺼져 있어요."; ClientsTitle.Text = "클라이언트"; SoundSummary.Text = "클라이언트를 연결해 주세요.";
    }
    private async Task StopCameraAsync()
    {
        bool wasActive = scanningQr || CameraControl.IsChecked == true;
        scanningQr = false; PinchEnabled.IsChecked = false; SetCameraToggle(false); await vision.StopCameraAsync();
        if (wasActive && client?.Connected == true) await client.StopCameraAsync(); Detection.Text = "카메라 꺼짐";
    }
    private void SetCameraToggle(bool value) { bool previous = refreshing; refreshing = true; CameraControl.IsChecked = value; refreshing = previous; }
    private void More_Click(object sender, RoutedEventArgs e)
    { DashboardMore.ContextMenu.PlacementTarget = DashboardMore; DashboardMore.ContextMenu.Placement = PlacementMode.Bottom; DashboardMore.ContextMenu.IsOpen = true; }
    private void Settings_Click(object sender, RoutedEventArgs e)
    {
        var settings = new MainWindow { Owner = this, WindowStartupLocation = WindowStartupLocation.CenterOwner }; settings.ShowDialog();
        if (hub is not null) { hub.Configure(ServerSettings()); RefreshServer(); }
    }
    private void Licenses_Click(object sender, RoutedEventArgs e) => MainWindow.OpenLicenses(this);
    private async void Stop_Click(object sender, RoutedEventArgs e) => await Guard(StopAllAsync);
    private async void Gestures_Click(object sender, RoutedEventArgs e) => await Guard(() => { if (refreshing || !((ToggleButton)sender).IsLoaded) return Task.CompletedTask; hub?.Configure(ServerSettings()); RefreshServer(); return Task.CompletedTask; });
    private void Voice_Click(object sender, RoutedEventArgs e) { if (refreshing || !((ToggleButton)sender).IsLoaded) return; speakEnabled = ((ToggleButton)sender).IsChecked == true; voice.Enabled = speakEnabled; }
    private async void CameraToggle_Click(object sender, RoutedEventArgs e) => await Guard(async () =>
    {
        if (refreshing || !((ToggleButton)sender).IsLoaded) return;
        if (CameraControl.IsChecked != true) { await StopCameraAsync(); return; }
        if (!loaded || client is not { Connected: true, Enabled: true }) { SetCameraToggle(false); Log("사용 중인 클라이언트로 서버에 연결한 뒤 카메라를 켜 주세요."); return; }
        if (state?.Capabilities?.SkeletonFrames != true) { SetCameraToggle(false); Log("골격을 지원하는 서버로 업데이트해 주세요."); return; }
        scanningQr = false; activeThreshold = state.DetectionThreshold;
        await vision.StartCameraAsync(cameraPreference.Facing, PrecisionMode, activeThreshold, deviceId: cameraPreference.DeviceId); Detection.Text = "골격만 서버로 전송합니다.";
    });
    private async void ScanQr_Click(object sender, RoutedEventArgs e) => await Guard(async () =>
    {
        if (hub is not null) { ShowInvitation(); return; }
        if (!loaded) { Log("카메라 준비가 끝난 뒤 다시 시도해 주세요."); return; }
        connectionDialog?.Close(); await StopCameraAsync(); scanningQr = true; await vision.StartCameraAsync(cameraPreference.Facing, qrOnly: true, deviceId: cameraPreference.DeviceId);
        SetCameraToggle(true); Detection.Text = "서버 PC의 연결 QR을 카메라에 보여 주세요. 토글을 끄면 읽기를 중지합니다.";
    });
    private async void Command_Click(object sender, RoutedEventArgs e) => await SendCommand((string)((Button)sender).Tag);
    private async void Mute_Click(object sender, RoutedEventArgs e) => await SendCommand(state?.Devices.FirstOrDefault(d => d.Id == target)?.Muted == true ? "unmute" : "mute");
    private Task SendCommand(string action) => Guard(async () =>
    { if (client is { Connected: true, Enabled: true } && target.HasValue) await client.CommandAsync(target.Value, action); else Log("사용할 클라이언트와 제어 대상을 연결해 주세요."); });
    private async void ClientToggle_Click(object sender, RoutedEventArgs e) => await Guard(async () =>
    {
        if (refreshing || !((ToggleButton)sender).IsLoaded) return;
        var toggle = (ToggleButton)sender; var id = (Guid)toggle.Tag;
        if (hub is not null) await hub.SetDeviceAllowedAsync(id, toggle.IsChecked == true);
        else if (client?.DeviceId == id) await client.SetEnabledAsync(toggle.IsChecked == true);
        RefreshServer();
    });
    private void ClientMore_Click(object sender, RoutedEventArgs e)
    {
        var button = (Button)sender; var id = (Guid)button.Tag; var device = state?.Devices.FirstOrDefault(d => d.Id == id); if (device is null) return;
        var menu = new ContextMenu();
        AddMenu(menu, "이 기기로 소리 제어", () => { target = id; hub?.SelectTargets(id, state?.VoiceTarget); if (state is not null) RefreshDevices(hub?.Snapshot() ?? state); }, device.Connected && device.Enabled);
        AddMenu(menu, "이 기기에서 음성 알림", () => { hub?.SelectTargets(state?.GestureTarget, id); RefreshServer(); }, hub is not null && device.Connected && device.Enabled);
        AddMenu(menu, "상세 정보", () => MessageBox.Show(this, $"{device.Name}\n{(device.Connected ? "연결됨" : "오프라인")} · {device.Platform}\n{(device.BatteryPercent.HasValue ? $"배터리 {device.BatteryPercent}%" : "배터리 정보 없음")}\n사용 여부는 카메라와 소리 제어에 적용됩니다.", "클라이언트 정보"));
        AddMenu(menu, "등록 해제", () => { if (MessageBox.Show(this, "이 기기의 등록을 해제할까요? 다시 사용하려면 QR로 등록해야 합니다.", "등록 해제", MessageBoxButton.OKCancel) == MessageBoxResult.OK) { hub?.Revoke(id); RefreshServer(); } }, hub is not null && id != Guid.Empty);
        menu.PlacementTarget = button; menu.Placement = PlacementMode.Bottom; menu.IsOpen = true;
    }
    private static void AddMenu(ContextMenu menu, string title, Action action, bool enabled = true)
    { var item = new MenuItem { Header = title, IsEnabled = enabled }; item.Click += (_, _) => action(); menu.Items.Add(item); }
    private void AddClient_Click(object sender, RoutedEventArgs e) { if (hub is null) { Log("이 PC에서 서버를 먼저 시작해 주세요. 다른 PC에 참여하려면 서버에 연결을 선택하세요."); return; } ShowInvitation(); }
    private void Join_Click(object sender, RoutedEventArgs e) => OpenConnection();
    private async void ConnectionMenu_Click(object sender, RoutedEventArgs e)
    { if (hub is not null) Log("서버 모드입니다. 서버 중지 후 다른 PC에 연결할 수 있어요."); else if (client?.Connected == true) await Guard(DisconnectAsync); else OpenConnection(); }
    private Window Panel(string title, StackPanel content, int width = 480)
    {
        var work = SystemParameters.WorkArea;
        var dialog = new Window { Title = title, Owner = this, Width = Math.Min(width, work.Width), Height = Math.Min(680, work.Height), MinWidth = Math.Min(360, work.Width), MinHeight = Math.Min(400, work.Height), Background = Background, FontSize = 15,
            WindowStartupLocation = WindowStartupLocation.CenterOwner, Content = new ScrollViewer { VerticalScrollBarVisibility = ScrollBarVisibility.Auto, Content = content } };
        content.Margin = new Thickness(24); return dialog;
    }
    private static void Label(Panel panel, string text) => panel.Children.Add(new TextBlock { Text = text, TextWrapping = TextWrapping.Wrap });
    private static Button ActionButton(Panel panel, string text, Action action, string? id = null)
    { var button = new Button { Content = text }; if (id is not null) System.Windows.Automation.AutomationProperties.SetAutomationId(button, id); button.Click += (_, _) => action(); panel.Children.Add(button); return button; }
    private void ServerOptions_Click(object sender, RoutedEventArgs e)
    {
        var content = new StackPanel(); Label(content, "클라이언트와 같은 사설망/VPN의 주소를 선택합니다.");
        var select = new ComboBox { ItemsSource = addresses, SelectedItem = bindAddress, IsEnabled = hub is null }; content.Children.Add(select);
        Label(content, hub is null ? "서버를 시작할 때 적용됩니다." : "주소를 바꾸려면 서버를 중지해 주세요.");
        var dialog = Panel("서버 연결 설정", content); ActionButton(content, "적용", () => { bindAddress = select.SelectedItem as string; dialog.Close(); }); dialog.ShowDialog();
    }
    private void Details_Click(object sender, RoutedEventArgs e)
    {
        var content = new StackPanel(); Label(content, hub is null ? saved?.Address ?? "서버에 연결되지 않았습니다." : hub.Address);
        Label(content, "음원 스트리밍·분리/합성·화면 배치·프로젝터·대화형 AI는 아직 연결 전입니다.");
        var events = new TextBox { Text = history, IsReadOnly = true, TextWrapping = TextWrapping.Wrap, MinHeight = 300, VerticalScrollBarVisibility = ScrollBarVisibility.Auto };
        System.Windows.Automation.AutomationProperties.SetAutomationId(events, "Events"); content.Children.Add(events);
        var dialog = Panel("연결 정보와 기록", content, 620); System.Windows.Automation.AutomationProperties.SetAutomationId(dialog, "DiagnosticsPanel"); dialog.ShowDialog();
    }
    private void ShowInvitation()
    {
        if (hub is null || certificate is null) return;
        if (invitationDialog is not null) { invitationDialog.Activate(); return; }
        var content = new StackPanel(); Label(content, "클라이언트에서 ‘QR로 연결’을 누르고 이 코드를 읽어 주세요.");
        var image = new Image { Width = 280, Height = 280, Margin = new Thickness(0, 16, 0, 16) }; content.Children.Add(image);
        var expiry = new TextBlock(); content.Children.Add(expiry);
        Label(content, "같은 사설망 또는 VPN에서 연결하세요. 서버 화면의 QR인지 확인한 뒤 등록합니다.");
        var details = new TextBox { IsReadOnly = true, TextWrapping = TextWrapping.Wrap };
        content.Children.Add(new Expander { Header = "QR 없이 직접 입력", Content = details, Margin = new Thickness(0, 12, 0, 12) });
        string? encoded = null, previous = null;
        var copy = ActionButton(content, "연결 코드 복사", () => { if (encoded is not null) { Clipboard.SetText(encoded); Log("2분짜리 연결 코드를 복사했습니다."); } });
        ActionButton(content, "새 QR 만들기", () => hub?.RenewPairing(), "RenewPairing");
        invitationDialog = Panel("클라이언트 연결", content);
        System.Windows.Automation.AutomationProperties.SetAutomationId(invitationDialog, "PairingPanel");
        var timer = new DispatcherTimer { Interval = TimeSpan.FromSeconds(1) };
        void Refresh()
        {
            if (hub is null || certificate is null) { invitationDialog?.Close(); return; }
            var link = hub.Invitation(Protocol.Pin(certificate)); long remaining = link.Expires - DateTimeOffset.UtcNow.ToUnixTimeSeconds();
            if (remaining <= 0) { image.Source = null; encoded = null; copy.IsEnabled = false; expiry.Text = "QR이 만료됐어요. 새 QR 만들기를 눌러 주세요."; details.Text = "만료된 연결 정보"; return; }
            encoded = link.Encode(); copy.IsEnabled = true; expiry.Text = $"{remaining}초 남음 · 한 번만 등록할 수 있어요.";
            if (encoded != previous) { image.Source = QrCode.Render(encoded); previous = encoded; details.Text = $"주소: {link.Address}\n지문: {link.Pin}\n등록 코드: {link.Code}"; }
        }
        timer.Tick += (_, _) => Refresh(); invitationDialog.Closed += (_, _) => { timer.Stop(); invitationDialog = null; };
        Refresh(); timer.Start(); invitationDialog.Show();
    }
    private void OpenConnection(PairingLink? link = null)
    {
        if (hub is not null) { Log("서버를 중지한 뒤 다른 서버에 연결할 수 있어요."); return; }
        if (connectionDialog is not null) { connectionDialog.Activate(); return; }
        imported = link;
        var content = new StackPanel(); Label(content, "QR을 읽거나 연결 코드를 붙여넣으면 입력이 채워집니다.");
        ActionButton(content, "카메라로 QR 읽기", () => ScanQr_Click(this, new()), "ScanPairingQr");
        var paste = new TextBox { MinHeight = 44, TextWrapping = TextWrapping.Wrap }; System.Windows.Automation.AutomationProperties.SetName(paste, "연결 코드 붙여넣기"); content.Children.Add(paste);
        ActionButton(content, "연결 코드 가져오기", () =>
        {
            try { var ticket = PairingLink.Parse(paste.Text); imported = ticket; serverUrl!.Text = ticket.Address; serverPin!.Text = ticket.Pin; pairCode!.Password = ticket.Code; pinConfirmed!.IsChecked = false; paste.Clear(); }
            catch (ArgumentException error) { MessageBox.Show(connectionDialog!, error.Message, "연결 코드 확인"); }
        }, "ImportPairingLink");
        Label(content, "서버 주소"); serverUrl = new TextBox { Text = link?.Address ?? saved?.Address ?? "", MinHeight = 36 }; content.Children.Add(serverUrl);
        Label(content, "서버 인증서 지문"); serverPin = new TextBox { Text = link?.Pin ?? saved?.Pin ?? "", TextWrapping = TextWrapping.Wrap, MinHeight = 56 }; content.Children.Add(serverPin);
        Label(content, "내 기기 이름"); deviceName = new TextBox { Text = Environment.MachineName, MinHeight = 36 }; content.Children.Add(deviceName);
        Label(content, "등록 코드 · 저장된 서버에 다시 연결할 때는 비워 두세요."); pairCode = new PasswordBox { Password = link?.Code ?? "", MinHeight = 36 }; content.Children.Add(pairCode);
        pinConfirmed = new CheckBox { Content = "내 서버 PC 화면의 QR 또는 주소·지문을 확인했습니다.", Margin = new Thickness(0, 16, 0, 16) }; content.Children.Add(pinConfirmed);
        serverUrl.TextChanged += (_, _) => pinConfirmed.IsChecked = false; serverPin.TextChanged += (_, _) => pinConfirmed.IsChecked = false;
        var errorText = new TextBlock { Foreground = System.Windows.Media.Brushes.DarkRed, TextWrapping = TextWrapping.Wrap }; content.Children.Add(errorText);
        var dialog = Panel("서버에 연결", content); connectionDialog = dialog;
        using var cancellation = new CancellationTokenSource();
        var connect = new Button { Content = "확인하고 연결" }; System.Windows.Automation.AutomationProperties.SetAutomationId(connect, "ConfirmConnection"); content.Children.Add(connect);
        connect.Click += async (_, _) =>
        {
            if (pinConfirmed.IsChecked != true) { errorText.Text = "내 서버의 QR 또는 지문인지 확인해 주세요."; return; }
            connect.IsEnabled = false;
            try
            {
                if (imported is not null) _ = PairingLink.Parse(imported.Encode());
                string address = Protocol.ServerUri(serverUrl.Text.Trim()).ToString(), pin = Protocol.NormalizePin(serverPin.Text);
                var grant = saved?.Address == address && saved.Pin == pin && pairCode.Password.Length == 0 ? saved.Grant
                    : await RemoteClient.PairAsync(address, pin, pairCode.Password, deviceName.Text, cancellation.Token);
                if (cancellation.IsCancellationRequested || closing) return;
                await DisconnectAsync(); await AttachAsync(address, pin, grant);
                saved = new(address, pin, grant); PrivateStore.Save("client", saved); pairCode.Clear(); dialog.Close();
            }
            catch (Exception) { errorText.Text = "연결하지 못했어요. 만료된 QR이면 새 QR을 읽고, 서버와 같은 네트워크인지 확인해 주세요."; }
            finally { connect.IsEnabled = true; }
        };
        dialog.Closed += (_, _) => { cancellation.Cancel(); connectionDialog = null; pairCode.Clear(); imported = null; };
        dialog.ShowDialog();
    }
}
