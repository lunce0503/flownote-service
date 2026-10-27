using System.Diagnostics;
using System.Text.Json;
using Flownote.Remote.Cli;
using Flownote.Remote.Core;
using Flownote.Remote.Network;

if (!OperatingSystem.IsLinux()) throw new InvalidOperationException("Linux acceptance check");
string root = Path.GetFullPath("."), directory = Path.Combine(Path.GetTempPath(), "fn-cli-" + Guid.NewGuid().ToString("N")[..8]);
string executable = Environment.GetEnvironmentVariable("FLOWNOTE_REMOTE_CLI") ?? "dotnet";
string[] prefix = Environment.GetEnvironmentVariable("FLOWNOTE_REMOTE_CLI") is null
    ? [Path.Combine(root, "src/Flownote.Remote.Cli/bin/Release/net10.0/flownote-remote.dll")] : [];
Process? server = null;
static void Check(bool value, string message) { if (!value) throw new InvalidOperationException(message); }
async Task<string> Control(params string[] words) => await LocalControl.CallAsync(directory, words, CancellationToken.None);
Process Launch(bool vision = false)
{
    var start = new ProcessStartInfo(executable) { UseShellExecute = false, RedirectStandardError = true, RedirectStandardOutput = true };
    foreach (string arg in prefix.Concat(new[] { "server", "--listen", "127.0.0.1", "--port", "0", "--data-dir", directory })
        .Concat(vision ? (prefix.Length == 0 ? Array.Empty<string>() : ["--vision-root", root]) : new[] { "--no-vision" })) start.ArgumentList.Add(arg);
    var process = Process.Start(start)!;
    _ = process.StandardError.ReadToEndAsync(); _ = process.StandardOutput.ReadToEndAsync(); return process;
}
async Task WaitReady()
{
    for (int i = 0; i < 200; i++)
    {
        if (server!.HasExited) throw new InvalidOperationException("CLI server failed to start");
        try { if ((await Control("status")).Contains("devices", StringComparison.Ordinal)) return; }
        catch (Exception e) when (e is IOException or System.Net.Sockets.SocketException) { }
        await Task.Delay(100);
    }
    throw new TimeoutException("CLI server not ready");
}
async Task StopServer()
{
    if (server is null) return;
    if (!server.HasExited)
    {
        using var kill = Process.Start(new ProcessStartInfo("kill") { ArgumentList = { "-TERM", server.Id.ToString() } })!;
        await kill.WaitForExitAsync(); await server.WaitForExitAsync().WaitAsync(TimeSpan.FromSeconds(10));
        Check(server.ExitCode == 0, "SIGTERM did not shut down cleanly");
    }
    server.Dispose(); server = null;
}
async Task Until(Func<bool> test)
{
    for (int i = 0; i < 100; i++) { if (test()) return; await Task.Delay(50); }
    throw new TimeoutException("Client state acknowledgement missing");
}
try
{
    server = Launch(); await WaitReady();
    var invitation = PairingLink.Parse(await Control("invite"));
    var grant = await RemoteClient.PairAsync(invitation.Address, invitation.Pin, invitation.Code, "Linux CLI acceptance");
    float volume = 0.4f; bool muted = false;
    var client = new RemoteClient(command => { volume = command.Volume; muted = command.Muted; return Task.FromResult(new OutputResult(true, volume, muted)); }, () => new(volume, muted));
    await client.ConnectAsync(invitation.Address, invitation.Pin, grant);
    await Task.Delay(150);
    Check((await Control("volume-up", grant.DeviceId.ToString())).StartsWith("QUEUED:", StringComparison.Ordinal), "No output command");
    await Until(() => Math.Abs(volume - 0.45f) < 0.001);
    var toolResult = await MediaTools.CallAsync(directory, JsonSerializer.SerializeToElement(new { action = "mute", deviceId = grant.DeviceId }), CancellationToken.None);
    Check(toolResult.StartsWith("QUEUED:", StringComparison.Ordinal), "Media tool could not route to the real owner socket");
    await Until(() => muted);
    try { await MediaTools.CallAsync(directory, JsonSerializer.SerializeToElement(new { action = "revoke", deviceId = grant.DeviceId }), CancellationToken.None); throw new Exception("Media tool allowed admin action"); }
    catch (ArgumentException) { }
    Check(await Control("pause", grant.DeviceId.ToString()) == "OK", "Pause failed");
    await Until(() => !client.Enabled);
    Check((await Control("mute", grant.DeviceId.ToString())).StartsWith("ERROR:", StringComparison.Ordinal), "Paused output accepted");
    await Control("allow", grant.DeviceId.ToString()); await Until(() => client.Enabled);
    await Control("mute", grant.DeviceId.ToString()); await Until(() => muted);
    Check((await Control("gestures", "on")).StartsWith("ERROR:"), "Touch mode must refuse gesture activation");
    foreach (string file in new[] { "server.pfx", "grants.json", "owner.sock", "server.lock" }) StateStore.VerifyPrivate(Path.Combine(directory, file));
    using (var second = Launch()) { await second.WaitForExitAsync().WaitAsync(TimeSpan.FromSeconds(10)); Check(second.ExitCode != 0, "Duplicate server replaced owner socket"); }
    Check((await Control("devices")).Contains(grant.DeviceId.ToString(), StringComparison.Ordinal), "Original owner socket was replaced");
    await client.DisposeAsync(); await StopServer();
    Check(!File.Exists(LocalControl.SocketPath(directory)), "Owner socket survived graceful stop");
    server = Launch(); await WaitReady();
    var restored = PairingLink.Parse(await Control("invite"));
    Check(restored.Pin == invitation.Pin, "Server identity changed across restarts");
    await using (var reconnect = new RemoteClient(_ => Task.FromResult(new OutputResult(false, 0, false)), () => new(0, false)))
    { await reconnect.ConnectAsync(restored.Address, restored.Pin, grant); Check(reconnect.Connected, "Stored client token could not reconnect"); }
    await Control("revoke", grant.DeviceId.ToString());
    using (var state = JsonDocument.Parse(await Control("status"))) Check(state.RootElement.GetProperty("devices").GetArrayLength() == 0, "Revocation not persisted");
    await StopServer();
    if (args.Contains("--vision"))
    {
        var store = new StateStore(directory); var settings = RemoteSettings.Defaults(); settings.ConfidenceThreshold = 0.7; store.SaveSettings(settings);
        server = Launch(true); await WaitReady();
        var live = PairingLink.Parse(await Control("invite"));
        var cameraGrant = await RemoteClient.PairAsync(live.Address, live.Pin, live.Code, "Real Linux vision");
        int commands = 0; GestureSample? recognized = null; bool isMuted = false;
        await using var camera = new RemoteClient(c => { commands++; isMuted=c.Muted; return Task.FromResult(new OutputResult(true, c.Volume, c.Muted)); }, () => new(0.4f, isMuted));
        camera.Gesture += result => recognized = result;
        await camera.ConnectAsync(live.Address, live.Pin, cameraGrant); await Control("gestures", "on");
        string modelRoot=prefix.Length==0 ? Path.GetDirectoryName(executable)! : root;
        await using var localModel=await VisionWorker.StartAsync(modelRoot,CancellationToken.None);
        var skeleton=await localModel.ExtractAsync(await File.ReadAllBytesAsync("artifacts/tests/thumb_up.jpg"));
        Check(skeleton.Hands.Length==1 && skeleton.Hands[0].Points.Length==21,"Real client hand landmarks missing");
        string wire=JsonSerializer.Serialize(skeleton,Protocol.Json);
        Check(!wire.Contains("jpeg",StringComparison.OrdinalIgnoreCase) && !wire.Contains("base64",StringComparison.OrdinalIgnoreCase),"Image in wire contract");
        await camera.SendSkeletonAsync(skeleton);
        Check(recognized?.Gesture=="Tracking" && commands==0,"Legacy thumb must not execute scoped command");
        await camera.StopCameraAsync();
        for(int i=1;i<=6;i++) { await camera.SendSkeletonAsync(TestSkeletons.Frame(TestSkeletons.Pose("crossed"),sequence:i)); await Task.Delay(150); }
        Check(commands==0&&!isMuted,"Gesture command escaped suspension");
        await camera.CommandAsync(cameraGrant.DeviceId,"mute");await Until(()=>isMuted);Check(commands==1,"Manual command failed");
        var task=new RemoteTask(Guid.NewGuid(),"Acceptance voice session");
        Check(await Control("task.upsert",JsonSerializer.Serialize(task,Protocol.Json))=="OK","Owner task registration failed");
        await Until(()=>camera.State?.Tasks?.Length==1);
        Check((await Control("tasks")).Contains(task.Id.ToString(),StringComparison.Ordinal),"Actual task missing");
        Check(await Control("task.remove",task.Id.ToString())=="OK","Owner task cleanup failed");
        await Until(()=>camera.State?.Tasks?.Length==0);
        Console.WriteLine("PASS: client Chromium/MediaPipe → 21 hand landmarks only → TLS/WSS skeleton server → mute acknowledgement, real owner task registration/removal");
        await StopServer();
    }
    Console.WriteLine("PASS: exact CLI server, owner socket permissions, TLS pairing, media acknowledgements, pause enforcement, duplicate process lock, stable certificate, reconnect, revocation and SIGTERM cleanup");
}
finally { if (server is not null) { if (!server.HasExited) server.Kill(true); await server.WaitForExitAsync(); server.Dispose(); } if (Directory.Exists(directory)) Directory.Delete(directory, true); }
