using System.IO;
using System.Security.Cryptography;
using System.Text.Json;
using Microsoft.Web.WebView2.Core;
using Microsoft.Web.WebView2.Wpf;
using Flownote.Remote.Network;
using Flownote.Remote.Core;

namespace Flownote.Remote.Windows;

public sealed class VisionHost : IDisposable
{
    private const string Origin = "https://flownote-remote.local/";
    public WebView2 View { get; } = new();
    private readonly SemaphoreSlim inference = new(1);
    private readonly TaskCompletionSource<bool> ready = new(TaskCreationOptions.RunContinuationsAsynchronously);
    private TaskCompletionSource<bool>? modelReady;
    private TaskCompletionSource<GestureSample>? result;
    private string? requestId;
    private bool cameraAllowed;
    private long lastSkeletonWarning = -10000;
    private TaskCompletionSource<SkeletonFrame>? skeleton;
    private TaskCompletionSource<CameraDevice[]>? devices;
    public sealed record CameraDevice(string Id, string Name);
    public event Action<byte[]>? CameraFrame;
    public event Action<SkeletonFrame>? SkeletonFrame;
    public event Action<string>? Activity;

    public async Task InitializeAsync()
    {
        string root = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "Flownote", "Remote", "vision-" + typeof(VisionHost).Assembly.GetName().Version);
        Directory.CreateDirectory(root);
        var assembly = typeof(VisionHost).Assembly;
        foreach (string name in assembly.GetManifestResourceNames().Where(n => n.StartsWith("Vision.", StringComparison.Ordinal)))
        {
            string relative = name[7..].Replace('\\', '/');
            string file = Path.GetFullPath(Path.Combine(root, relative));
            if (!file.StartsWith(root + Path.DirectorySeparatorChar, StringComparison.OrdinalIgnoreCase)) throw new InvalidOperationException("잘못된 영상 자산 경로");
            using var input = assembly.GetManifestResourceStream(name)!;
            using var bytes = new MemoryStream(); await input.CopyToAsync(bytes);
            byte[] data = bytes.ToArray();
            if (!File.Exists(file) || !SHA256.HashData(await File.ReadAllBytesAsync(file)).SequenceEqual(SHA256.HashData(data)))
            { Directory.CreateDirectory(Path.GetDirectoryName(file)!); await File.WriteAllBytesAsync(file, data); }
        }
        if (!File.Exists(Path.Combine(root, "index.html"))) throw new InvalidOperationException("영상 모델 자산이 없습니다. prepare-vision을 실행한 빌드가 필요합니다.");
        var environment = await CoreWebView2Environment.CreateAsync(null, Path.Combine(root, "browser"));
        await View.EnsureCoreWebView2Async(environment);
        View.CoreWebView2.Settings.AreDevToolsEnabled = false;
        View.CoreWebView2.Settings.AreDefaultContextMenusEnabled = false;
        View.CoreWebView2.Settings.IsStatusBarEnabled = false;
        View.CoreWebView2.SetVirtualHostNameToFolderMapping("flownote-remote.local", root, CoreWebView2HostResourceAccessKind.DenyCors);
        View.CoreWebView2.NavigationStarting += (_, e) => { if (e.Uri != Origin + "index.html") e.Cancel = true; };
        View.CoreWebView2.NewWindowRequested += (_, e) => e.Handled = true;
        View.CoreWebView2.PermissionRequested += (_, e) => e.State = cameraAllowed && e.Uri.StartsWith(Origin, StringComparison.Ordinal) &&
            e.PermissionKind == CoreWebView2PermissionKind.Camera ? CoreWebView2PermissionState.Allow : CoreWebView2PermissionState.Deny;
        View.CoreWebView2.WebMessageReceived += (_, e) =>
        {
            if (!e.Source.StartsWith(Origin, StringComparison.Ordinal)) return;
            using var doc = JsonDocument.Parse(e.WebMessageAsJson); var message = doc.RootElement;
            switch (message.GetProperty("type").GetString())
            {
                case "vision.ready": ready.TrySetResult(true); break;
                case "model.ready": modelReady?.TrySetResult(true); break;
                case "gesture.result":
                    if (message.GetProperty("id").GetString() == requestId)
                        result?.TrySetResult(new(message.GetProperty("gesture").GetString(), message.GetProperty("confidence").GetDouble()));
                    break;
                case "gesture.error":
                    result?.TrySetException(new InvalidOperationException("영상 분석 실패"));
                    skeleton?.TrySetException(new InvalidOperationException("골격 추출 실패"));
                    modelReady?.TrySetException(new InvalidOperationException("인식 모델을 불러오지 못했습니다.")); break;
                case "camera.error": cameraAllowed = false; Activity?.Invoke("카메라 권한 또는 입력 장치를 확인하세요."); break;
                case "camera.frame":
                    if (cameraAllowed) CameraFrame?.Invoke(Convert.FromBase64String(message.GetProperty("jpeg").GetString()!));
                    break;
                case "camera.skeleton":
                    if (cameraAllowed)
                    {
                        try { var frame = message.GetProperty("frame").Deserialize<SkeletonFrame>(Protocol.Json)!; frame.Validate(); SkeletonFrame?.Invoke(frame); }
                        catch (Exception error) when (error is ArgumentException or JsonException)
                        {
                            if (Environment.TickCount64-lastSkeletonWarning >= 5000)
                            {
                                lastSkeletonWarning = Environment.TickCount64;
                                Activity?.Invoke(SkeletonDiagnostics.Message(error is SkeletonFrameException invalid ? invalid.Code : "invalid_schema"));
                            }
                        }
                    }
                    break;
                case "skeleton.result":
                    if (message.GetProperty("id").GetString() == requestId) skeleton?.TrySetResult(message.GetProperty("frame").Deserialize<SkeletonFrame>(Protocol.Json)!);
                    break;
                case "camera.devices": devices?.TrySetResult(message.GetProperty("devices").Deserialize<CameraDevice[]>(Protocol.Json)!); break;
            }
        };
        View.Source = new Uri(Origin + "index.html");
        await ready.Task.WaitAsync(TimeSpan.FromSeconds(20));
    }
    public async Task LoadModelAsync()
    {
        modelReady = new(TaskCreationOptions.RunContinuationsAsynchronously);
        await View.CoreWebView2.ExecuteScriptAsync("window.remoteVision.loadModel().catch(()=>window.chrome.webview.postMessage({type:'gesture.error'}))");
        await modelReady.Task.WaitAsync(TimeSpan.FromSeconds(40));
    }
    public async Task<GestureSample> InferAsync(byte[] jpeg)
    {
        if (!await inference.WaitAsync(0)) return new(null, 0);
        try
        {
            result = new(TaskCreationOptions.RunContinuationsAsynchronously); requestId = Guid.NewGuid().ToString();
            await (await View.Dispatcher.InvokeAsync(() => View.CoreWebView2.ExecuteScriptAsync(
                "window.remoteVision.infer(" + JsonSerializer.Serialize(Convert.ToBase64String(jpeg)) + "," + JsonSerializer.Serialize(requestId) + ")")));
            return await result.Task.WaitAsync(TimeSpan.FromSeconds(3));
        }
        finally { result = null; requestId = null; inference.Release(); }
    }
    public async Task<SkeletonFrame> ExtractSkeletonAsync(byte[] jpeg)
    {
        await inference.WaitAsync();
        try
        {
            skeleton = new(TaskCreationOptions.RunContinuationsAsynchronously); requestId = Guid.NewGuid().ToString();
            await (await View.Dispatcher.InvokeAsync(() => View.CoreWebView2.ExecuteScriptAsync(
                "window.remoteVision.extract(" + JsonSerializer.Serialize(Convert.ToBase64String(jpeg)) + "," + JsonSerializer.Serialize(requestId) + ")")));
            var frame = await skeleton.Task.WaitAsync(TimeSpan.FromSeconds(8)); frame.Validate(); return frame;
        }
        finally { skeleton = null; requestId = null; inference.Release(); }
    }
    public async Task<CameraDevice[]> CamerasAsync()
    {
        devices = new(TaskCreationOptions.RunContinuationsAsynchronously);
        await View.CoreWebView2.ExecuteScriptAsync("window.remoteVision.cameras().then(devices=>window.chrome.webview.postMessage({type:'camera.devices',devices}))");
        return await devices.Task.WaitAsync(TimeSpan.FromSeconds(8));
    }
    public Task PrecisionAsync(string mode) => View.CoreWebView2.ExecuteScriptAsync("window.remoteVision.setPrecision(" + JsonSerializer.Serialize(mode) + ")");
    public async Task StartCameraAsync(string facing = "front", string mode = "off", double threshold = .8, bool qrOnly = false, string? deviceId = null)
    {
        cameraAllowed = true;
        string options = JsonSerializer.Serialize(new { facing, precisionMode = mode, threshold, qrOnly, deviceId });
        await View.CoreWebView2.ExecuteScriptAsync("window.remoteVision.startCamera(" + options + ").catch(()=>{window.remoteVision.stopCamera();window.chrome.webview.postMessage({type:'camera.error'})})");
    }
    public async Task StopCameraAsync()
    { cameraAllowed = false; if (View.CoreWebView2 is not null) await View.CoreWebView2.ExecuteScriptAsync("window.remoteVision.stopCamera()"); }
    public void Dispose() { cameraAllowed = false; View.Dispose(); }
}
