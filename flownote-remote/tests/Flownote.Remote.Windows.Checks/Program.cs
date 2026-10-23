using System.IO;
using System.Net;
using System.Speech.Synthesis;
using System.Windows;
using Flownote.Remote.Core;
using Flownote.Remote.Network;
using Flownote.Remote.Windows;

internal static class Program
{
    [STAThread]
    private static void Main(string[] args)
    {
        var app = new Application(); var vision = new VisionHost();
        var window = new Window { Title = "Remote network and vision acceptance", Width = 640, Height = 420, Content = vision.View };
        window.Loaded += async (_, _) =>
        {
            try { await RunAsync(vision, args.Length > 0 ? args[0] : "artifacts/tests/thumb_up.jpg"); vision.Dispose(); app.Shutdown(0); }
            catch (Exception error) { Console.Error.WriteLine(error); vision.Dispose(); app.Shutdown(1); }
        };
        app.Run(window);
    }
    private static void Check(bool value, string name) { if (!value) throw new InvalidOperationException(name); }
    private static async Task RunAsync(VisionHost vision, string imagePath)
    {
        await vision.InitializeAsync(); await vision.LoadModelAsync();
        byte[] image = await File.ReadAllBytesAsync(imagePath); Protocol.ValidateJpeg(image);
        var recognized = await vision.InferAsync(image);
        Console.WriteLine($"Real MediaPipe classification: {recognized.Gesture} {recognized.Confidence:F3}");
        Check(recognized.Gesture == "Thumb_Up" && recognized.Confidence >= 0.7, "Real gesture model did not recognize the public thumb-up fixture");
        var settings = RemoteSettings.Defaults(); settings.GesturesEnabled = true;
        using var cert = Protocol.CreateCertificate(IPAddress.Loopback);
        await using var hub = new RemoteHub(settings, vision.InferAsync);
        await hub.StartAsync(IPAddress.Loopback, 0, cert);
        var grant = await RemoteClient.PairAsync(hub.Address, Protocol.Pin(cert), hub.PairingCode, "Camera acceptance client");
        float volume = 0.4f; int commands = 0, spokenAlerts = 0;
        await using var client = new RemoteClient(command => { volume = command.Volume; commands++; return Task.FromResult(new OutputResult(true, volume, command.Muted)); }, () => new(volume, false));
        client.Alert += alert => { if (alert.Speak) Interlocked.Increment(ref spokenAlerts); };
        await client.ConnectAsync(hub.Address, Protocol.Pin(cert), grant);
        await Task.Delay(250);
        if (recognized.Confidence < settings.ConfidenceThreshold)
        {
            for (int frame = 0; frame < 3; frame++) { await client.SendCameraAsync(image); await Task.Delay(200); }
            Check(commands == 0, "Below-threshold model result caused an output command");
        }
        settings.ConfidenceThreshold = 0.7; hub.Configure(settings);
        for (int frame = 0; frame < 5; frame++) { await client.SendCameraAsync(image); await Task.Delay(200); }
        for (int i = 0; i < 30 && commands == 0; i++) await Task.Delay(100);
        Check(commands == 1 && Math.Abs(volume - 0.45f) < 0.01, "Camera -> server model -> gesture gate -> authenticated client output acknowledgement failed");
        await hub.AnnounceAsync("test.server.warning", "critical", "서버 상태를 확인하세요.", "Please check the server status.");
        for (int i = 0; i < 30 && spokenAlerts == 0; i++) await Task.Delay(50);
        Check(spokenAlerts > 0, "Server critical notice did not reach the voice client");
        using var speech = new SpeechSynthesizer(); using var wave = new MemoryStream();
        speech.SetOutputToWaveStream(wave); speech.Speak("Please check the server status.");
        Check(wave.Length > 1000, "OS assistant voice did not synthesize a WAV");
        Console.WriteLine("PASS: real camera-image model, TLS/WSS server command routing and output test adapter, held-gesture suppression, critical alert delivery and real OS speech synthesis");
    }
}
