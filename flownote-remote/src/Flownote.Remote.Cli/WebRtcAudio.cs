using System.Collections.Concurrent;
using System.Diagnostics;
using System.Text.Json;
using System.Threading.Channels;

namespace Flownote.Remote.Cli;

// SDP and media only. Never receives account credentials or an API key.
public sealed class WebRtcAudio : IAsyncDisposable
{
    private readonly Process process;
    private readonly CancellationTokenSource stop = new();
    private readonly SemaphoreSlim writer = new(1);
    private readonly ConcurrentDictionary<long, TaskCompletionSource> pending = new();
    private readonly Task reader;
    private long nextId;
    public TaskCompletionSource<string> Offer { get; } = new(TaskCreationOptions.RunContinuationsAsynchronously);
    public Channel<JsonElement> Events { get; } = Channel.CreateBounded<JsonElement>(64);
    public WebRtcAudio(string root, string node)
    {
        root = Path.GetFullPath(root);
        string script = Path.Combine(root, "scripts", "voice-worker.mjs");
        if (!File.Exists(script)) throw new ArgumentException("--voice-root must contain scripts/voice-worker.mjs and pinned Playwright packages. See docs/CLI.md.");
        var info = new ProcessStartInfo(node) { WorkingDirectory = root, UseShellExecute = false,
            RedirectStandardInput = true, RedirectStandardOutput = true, RedirectStandardError = true };
        foreach (string name in new[] { "OPENAI_API_KEY", "CODEX_API_KEY", "CODEX_ACCESS_TOKEN", "OPENAI_ACCESS_TOKEN" }) info.Environment.Remove(name);
        info.ArgumentList.Add(script);
        process = Process.Start(info) ?? throw new InvalidOperationException("Cannot start WebRTC media worker.");
        _ = Task.Run(async () => { try { while (await process.StandardError.ReadLineAsync() is not null) { } } catch (IOException) { } });
        reader = ReadAsync();
    }
    private async Task ReadAsync()
    {
        Exception failure = new IOException("WebRTC media worker exited.");
        try
        {
            while (!stop.IsCancellationRequested)
            {
                string? line = await CodexRpc.BoundedLineAsync(process.StandardOutput, stop.Token);
                if (line is null) break;
                using var doc = JsonDocument.Parse(line); var data = doc.RootElement;
                string? type = data.GetProperty("type").GetString();
                if (type == "offer")
                {
                    string sdp = data.GetProperty("sdp").GetString() ?? "";
                    if (sdp.Length is < 1 or > 65536) throw new IOException("Invalid WebRTC offer.");
                    Offer.TrySetResult(sdp);
                }
                else if (type == "ack")
                { if (pending.TryRemove(data.GetProperty("id").GetInt64(), out var promise)) promise.TrySetResult(); }
                else if (type == "error") throw new InvalidOperationException(data.GetProperty("message").GetString());
                else await Events.Writer.WriteAsync(data.Clone(), stop.Token);
            }
        }
        catch (Exception e) when (e is IOException or OperationCanceledException or JsonException or InvalidOperationException or KeyNotFoundException) { failure = e; }
        finally
        {
            Offer.TrySetException(failure);
            foreach (var item in pending) if (pending.TryRemove(item.Key, out var promise)) promise.TrySetException(failure);
            Events.Writer.TryComplete(stop.IsCancellationRequested ? null : failure);
        }
    }
    public Task AnswerAsync(string sdp, CancellationToken token) => SendAsync(new { type = "answer", sdp }, token);
    public Task InputAsync(byte[] pcm, int count, CancellationToken token) => SendAsync(new { type = "input", data = Convert.ToBase64String(pcm, 0, count) }, token);
    private async Task SendAsync(object message, CancellationToken token)
    {
        long id = Interlocked.Increment(ref nextId);
        var promise = new TaskCompletionSource(TaskCreationOptions.RunContinuationsAsynchronously); pending[id] = promise;
        try
        {
            if (reader.IsCompleted) throw new IOException("WebRTC worker has exited.");
            var fields = JsonSerializer.SerializeToElement(message).EnumerateObject().ToDictionary(p => p.Name, p => p.Value.Clone());
            fields["id"] = JsonSerializer.SerializeToElement(id);
            await writer.WaitAsync(token);
            try { await process.StandardInput.WriteLineAsync(JsonSerializer.Serialize(fields).AsMemory(), token); await process.StandardInput.FlushAsync(token); }
            finally { writer.Release(); }
            await promise.Task.WaitAsync(TimeSpan.FromSeconds(10), token);
        }
        finally { pending.TryRemove(id, out _); }
    }
    public async ValueTask DisposeAsync()
    {
        stop.Cancel(); if (!process.HasExited) process.Kill(true);
        await reader; await process.WaitForExitAsync(); process.Dispose(); stop.Dispose();
    }
}
