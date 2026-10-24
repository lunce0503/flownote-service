using System.Collections.Concurrent;
using System.Diagnostics;
using System.Text.Json;
using System.Threading.Channels;

namespace Flownote.Remote.Cli;

// Codex owns authentication. This process never reads auth.json or handles account tokens.
public sealed class CodexRpc : IAsyncDisposable
{
    private readonly Process process;
    private readonly SemaphoreSlim writer = new(1);
    private readonly ConcurrentDictionary<long, TaskCompletionSource<JsonElement>> pending = new();
    private readonly CancellationTokenSource stop = new();
    private readonly Task reader;
    private long nextId;
    public Channel<JsonElement> Events { get; } = Channel.CreateBounded<JsonElement>(new BoundedChannelOptions(64)
        { SingleReader = true, SingleWriter = true, FullMode = BoundedChannelFullMode.Wait });
    public Func<JsonElement, Task<object>>? ServerRequest { get; set; }

    public CodexRpc(string executable, string workspace)
    {
        var info = new ProcessStartInfo(executable) { WorkingDirectory = workspace, UseShellExecute = false,
            RedirectStandardInput = true, RedirectStandardOutput = true, RedirectStandardError = true };
        foreach (string word in new[] { "app-server", "--listen", "stdio://" }) info.ArgumentList.Add(word);
        UseAccountCredentials(info);
        process = Process.Start(info) ?? throw new InvalidOperationException("Cannot start Codex CLI.");
        _ = Task.Run(async () => { try { while (await process.StandardError.ReadLineAsync() is not null) { } } catch (IOException) { } });
        reader = ReadAsync();
    }
    public static void UseAccountCredentials(ProcessStartInfo info)
    {
        // Prefer the account already managed by Codex; never silently use a shell API key.
        info.Environment.Remove("OPENAI_API_KEY");
        info.Environment.Remove("CODEX_API_KEY");
    }
    private async Task ReadAsync()
    {
        Exception failure = new IOException("Codex app-server disconnected.");
        try
        {
            while (!stop.IsCancellationRequested)
            {
                string? line = await BoundedLineAsync(process.StandardOutput, stop.Token);
                if (line is null) break;
                using var doc = JsonDocument.Parse(line); var message = doc.RootElement;
                if (message.TryGetProperty("method", out _) && message.TryGetProperty("id", out var requestId))
                {
                    object response;
                    try
                    {
                        if (ServerRequest is null) throw new InvalidOperationException("Interactive requests are not supported by this voice client.");
                        response = new { id = requestId.Clone(), result = await ServerRequest(message.Clone()) };
                    }
                    catch (Exception e) when (e is InvalidOperationException or ArgumentException or IOException or System.Net.Sockets.SocketException or JsonException or OperationCanceledException or KeyNotFoundException)
                    { response = new { id = requestId.Clone(), error = new { code = -32601, message = "Request denied by the Flownote voice client." } }; }
                    await WriteAsync(response, stop.Token);
                }
                else if (message.TryGetProperty("id", out var id) && id.TryGetInt64(out long number) && pending.TryRemove(number, out var promise))
                {
                    if (message.TryGetProperty("error", out var error))
                        promise.TrySetException(new InvalidOperationException("Codex: " + error.GetProperty("message").GetString()));
                    else promise.TrySetResult(message.GetProperty("result").Clone());
                }
                else if (message.TryGetProperty("method", out _)) await Events.Writer.WriteAsync(message.Clone(), stop.Token);
            }
        }
        catch (Exception e) when (e is IOException or OperationCanceledException or JsonException or InvalidOperationException or KeyNotFoundException)
        { failure = e; }
        finally
        {
            foreach (var entry in pending) if (pending.TryRemove(entry.Key, out var promise)) promise.TrySetException(failure);
            Events.Writer.TryComplete(stop.IsCancellationRequested ? null : failure);
        }
    }
    internal static async Task<string?> BoundedLineAsync(StreamReader reader, CancellationToken token)
    {
        // StreamReader.ReadLineAsync alone permits an unbounded line from a child process.
        var line = new System.Text.StringBuilder(); var buffer = new char[1];
        while (await reader.ReadAsync(buffer, token) != 0)
        {
            if (buffer[0] == '\n') return line.ToString();
            if (line.Length >= 2097152) throw new IOException("Codex protocol message exceeds 2 MiB.");
            line.Append(buffer[0]);
        }
        return line.Length == 0 ? null : throw new IOException("Truncated Codex protocol message.");
    }
    public async Task<JsonElement> RequestAsync(string method, object parameters, CancellationToken token)
    {
        long id = Interlocked.Increment(ref nextId);
        var completion = new TaskCompletionSource<JsonElement>(TaskCreationOptions.RunContinuationsAsynchronously);
        pending[id] = completion;
        try
        {
            if (reader.IsCompleted) throw new IOException("Codex app-server has exited.");
            await WriteAsync(new { id, method, @params = parameters }, token);
            return await completion.Task.WaitAsync(TimeSpan.FromSeconds(45), token);
        }
        finally { pending.TryRemove(id, out _); }
    }
    public Task NotifyAsync(string method, object parameters, CancellationToken token) => WriteAsync(new { method, @params = parameters }, token);
    private async Task WriteAsync(object message, CancellationToken token)
    {
        await writer.WaitAsync(token);
        try { await process.StandardInput.WriteLineAsync(JsonSerializer.Serialize(message).AsMemory(), token); await process.StandardInput.FlushAsync(token); }
        finally { writer.Release(); }
    }
    public async ValueTask DisposeAsync()
    {
        stop.Cancel();
        if (!process.HasExited) process.Kill(true);
        await reader; await process.WaitForExitAsync(); process.Dispose(); stop.Dispose();
    }

    public static async Task CheckSchemaAsync(string executable, CancellationToken token)
    {
        string directory = Path.Combine(Path.GetTempPath(), "flownote-codex-schema-" + Guid.NewGuid().ToString("N"));
        try
        {
            int code = await RunProbeAsync(executable, ["app-server", "generate-json-schema", "--experimental", "--out", directory], token);
            if (code != 0) throw new InvalidOperationException("Codex schema generation failed. Install a Codex CLI with thread/realtime support.");
            string methods = await File.ReadAllTextAsync(Path.Combine(directory, "ClientRequest.json"), token);
            foreach (string method in new[] { "account/read", "thread/realtime/start", "thread/realtime/stop" })
                if (!methods.Contains('"' + method + '"', StringComparison.Ordinal)) throw new InvalidOperationException("Installed Codex CLI does not support " + method);
            using var schema = JsonDocument.Parse(await File.ReadAllTextAsync(Path.Combine(directory, "v2", "ThreadRealtimeStartParams.json"), token));
            if (!schema.RootElement.GetProperty("properties").TryGetProperty("outputModality", out _))
                throw new InvalidOperationException("Codex realtime schema is incompatible. Update the CLI; tested with 0.164.0.");
            string sdpSchema = Path.Combine(directory, "v2", "ThreadRealtimeSdpNotification.json");
            if (!File.Exists(sdpSchema) || !schema.RootElement.ToString().Contains("webrtc", StringComparison.Ordinal))
                throw new InvalidOperationException("Codex does not expose the account WebRTC voice protocol. Update Codex CLI.");
        }
        finally { if (Directory.Exists(directory)) Directory.Delete(directory, true); }
    }
    public static async Task<int> RunProbeAsync(string executable, string[] arguments, CancellationToken token)
    {
        var info = new ProcessStartInfo(executable) { UseShellExecute = false, RedirectStandardOutput = true, RedirectStandardError = true };
        foreach (string arg in arguments) info.ArgumentList.Add(arg);
        using var process = Process.Start(info) ?? throw new InvalidOperationException("Cannot start " + executable);
        Task output = process.StandardOutput.BaseStream.CopyToAsync(Stream.Null, token), error = process.StandardError.BaseStream.CopyToAsync(Stream.Null, token);
        try { await process.WaitForExitAsync(token).WaitAsync(TimeSpan.FromSeconds(30), token); await Task.WhenAll(output, error); return process.ExitCode; }
        finally { if (!process.HasExited) process.Kill(true); }
    }
}
