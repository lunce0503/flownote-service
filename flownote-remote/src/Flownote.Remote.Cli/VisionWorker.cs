using System.Diagnostics;
using System.Text.Json;
using Flownote.Remote.Network;
using Flownote.Remote.Core;

namespace Flownote.Remote.Cli;

public sealed class VisionWorker : IAsyncDisposable
{
    private readonly Process process;
    private readonly SemaphoreSlim gate = new(1);
    private bool failed;
    private VisionWorker(Process process) { this.process = process; }
    public static async Task<VisionWorker> StartAsync(string root, CancellationToken token)
    {
        root = Path.GetFullPath(root);
        if (!File.Exists(Path.Combine(root, "scripts", "vision-worker.mjs")))
            throw new ArgumentException("--vision-root must contain scripts/vision-worker.mjs, node_modules and artifacts/vision. See docs/CLI.md; --no-vision runs media control only.");
        var info = new ProcessStartInfo("node") { WorkingDirectory = root, RedirectStandardInput = true, RedirectStandardOutput = true,
            RedirectStandardError = true, UseShellExecute = false };
        info.ArgumentList.Add(Path.Combine(root, "scripts", "vision-worker.mjs"));
        var process = Process.Start(info) ?? throw new InvalidOperationException("Cannot start Node vision worker.");
        var worker = new VisionWorker(process);
        _ = Task.Run(async () => { while (await process.StandardError.ReadLineAsync() is not null) { /* Child diagnostics can contain paths; do not retain camera data. */ } });
        try
        {
            string ready = await process.StandardOutput.ReadLineAsync(token).AsTask().WaitAsync(TimeSpan.FromSeconds(90), token)
                ?? throw new InvalidOperationException("Vision worker exited. Install Node 24, npm ci, prepare:vision and Playwright Chromium.");
            using var doc = JsonDocument.Parse(ready);
            if (!doc.RootElement.TryGetProperty("ready", out var value) || !value.GetBoolean()) throw new InvalidOperationException("Vision worker failed to initialize.");
            return worker;
        }
        catch { await worker.DisposeAsync(); throw; }
    }
    public async Task<GestureSample> InferAsync(byte[] frame)
    {
        if (!await gate.WaitAsync(0)) return new(null, 0);
        try
        {
            if (failed || process.HasExited) throw new InvalidOperationException("Vision worker unavailable. Restart the server.");
            string id = Guid.NewGuid().ToString();
            await process.StandardInput.WriteLineAsync(JsonSerializer.Serialize(new { id, jpeg = Convert.ToBase64String(frame) }));
            await process.StandardInput.FlushAsync();
            string line = await process.StandardOutput.ReadLineAsync().WaitAsync(TimeSpan.FromSeconds(3)) ?? throw new IOException("Vision worker exited.");
            using var doc = JsonDocument.Parse(line); var response = doc.RootElement;
            if (response.GetProperty("id").GetString() != id) throw new IOException("Vision response mismatch.");
            return new(response.GetProperty("gesture").GetString(), response.GetProperty("confidence").GetDouble());
        }
        catch (Exception e) when (e is IOException or TimeoutException or JsonException or InvalidOperationException)
        { failed = true; if (!process.HasExited) process.Kill(true); throw new InvalidOperationException("Vision worker unavailable. Restart the server.", e); }
        finally { gate.Release(); }
    }
    // Acceptance/local diagnostics only: production servers never receive images.
    public async Task<SkeletonFrame> ExtractAsync(byte[] image)
    {
        await gate.WaitAsync();
        try
        {
            string id = Guid.NewGuid().ToString();
            await process.StandardInput.WriteLineAsync(JsonSerializer.Serialize(new { id, skeleton = true, jpeg = Convert.ToBase64String(image) }));
            await process.StandardInput.FlushAsync();
            string line = await process.StandardOutput.ReadLineAsync().WaitAsync(TimeSpan.FromSeconds(15)) ?? throw new IOException("Local model exited.");
            using var doc = JsonDocument.Parse(line);
            if (doc.RootElement.GetProperty("id").GetString() != id) throw new IOException("Local model response mismatch.");
            var frame = doc.RootElement.GetProperty("frame").Deserialize<SkeletonFrame>(Protocol.Json)!;
            frame.Validate(); return frame;
        }
        finally { gate.Release(); }
    }
    public async ValueTask DisposeAsync()
    { if (!process.HasExited) process.Kill(true); await process.WaitForExitAsync(); process.Dispose(); }
}
