using System.Diagnostics;
using System.Net;
using System.Runtime.InteropServices;
using System.Text.Json;
using Flownote.Remote.Core;
using Flownote.Remote.Network;

if (Environment.GetEnvironmentVariable("CI") != "true") throw new InvalidOperationException("The device acceptance fixture runs only in disposable CI.");
string configFile = args.Length > 0 ? args[0] : throw new ArgumentException("Ready file path required");
using var worker = new Process { StartInfo = new ProcessStartInfo("node", "tests/vision-worker.mjs") { RedirectStandardInput = true, RedirectStandardOutput = true, RedirectStandardError = true, UseShellExecute = false } };
worker.Start(); _ = worker.StandardError.ReadToEndAsync();
using var shutdown = new CancellationTokenSource();
using var registration = PosixSignalRegistration.Create(PosixSignal.SIGTERM, context => { context.Cancel = true; shutdown.Cancel(); });
Console.CancelKeyPress += (_, e) => { e.Cancel = true; shutdown.Cancel(); };
using var semaphore = new SemaphoreSlim(1);
try
{
    string ready = await worker.StandardOutput.ReadLineAsync().WaitAsync(TimeSpan.FromSeconds(60)) ?? throw new InvalidOperationException("Vision worker exited");
    if (!ready.Contains("ready", StringComparison.Ordinal)) throw new InvalidOperationException("Vision worker is not ready");
    var settings = RemoteSettings.Defaults(); settings.GesturesEnabled = true; settings.ConfidenceThreshold = 0.7;
    using var cert = Protocol.CreateCertificate(IPAddress.Loopback, IPAddress.Parse("10.0.2.2"));
    await using var hub = new RemoteHub(settings, async bytes =>
    {
        if (!await semaphore.WaitAsync(0)) return new(null, 0);
        try
        {
            string id = Guid.NewGuid().ToString();
            await worker.StandardInput.WriteLineAsync(JsonSerializer.Serialize(new { id, jpeg = Convert.ToBase64String(bytes) })); await worker.StandardInput.FlushAsync();
            string result = await worker.StandardOutput.ReadLineAsync().WaitAsync(TimeSpan.FromSeconds(3)) ?? throw new InvalidOperationException("Vision worker exited");
            using var response = JsonDocument.Parse(result);
            if (response.RootElement.GetProperty("id").GetString() != id) throw new InvalidOperationException("Vision worker response mismatch");
            return new(response.RootElement.GetProperty("gesture").GetString(), response.RootElement.GetProperty("confidence").GetDouble());
        }
        finally { semaphore.Release(); }
    });
    await hub.StartAsync(IPAddress.Loopback, Protocol.Port, cert);
    Directory.CreateDirectory(Path.GetDirectoryName(Path.GetFullPath(configFile))!);
    await File.WriteAllTextAsync(configFile, JsonSerializer.Serialize(new { address = $"https://10.0.2.2:{Protocol.Port}/", pin = Protocol.Pin(cert), code = hub.PairingCode,
        certificate = Convert.ToBase64String(cert.RawData), invitation = hub.Invitation(Protocol.Pin(cert)).Encode() }, Protocol.Json));
    Console.WriteLine("READY: private TLS device fixture and real MediaPipe worker");
    try { await Task.Delay(Timeout.Infinite, shutdown.Token); } catch (OperationCanceledException) { }
}
finally { if (!worker.HasExited) worker.Kill(true); }
