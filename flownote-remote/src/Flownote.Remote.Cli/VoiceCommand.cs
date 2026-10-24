using System.Diagnostics;
using System.Text.Json;

namespace Flownote.Remote.Cli;

public static class VoiceCommand
{
    public const int SampleRate = 24000;
    public static async Task<int> DoctorAsync(Options options, CancellationToken token)
    {
        string codex = options.Value("codex", "codex"); options.Validate([]);
        await CodexRpc.CheckSchemaAsync(codex, token);
        Console.WriteLine("PASS: Codex realtime app-server protocol (experimental)");
        bool login = await CodexRpc.RunProbeAsync(codex, ["login", "status"], token) == 0;
        Console.WriteLine(login ? "PASS: Codex login" : "MISSING: run codex login --device-auth on the server");
        foreach (string tool in new[] { "arecord", "aplay" })
            Console.WriteLine(FindExecutable(tool) is null ? "MISSING: " + tool + " (install alsa-utils, or use voice --pcm-stdio)" : "PASS: " + tool);
        Console.WriteLine("Voice account entitlement and physical microphone/playback are checked when a session starts.");
        Console.WriteLine("The tested Codex 0.164.0 WebSocket voice bridge requires API-key auth. For account-based native voice use: voice --native, then /voice.");
        return login ? 0 : 1;
    }
    private static string? FindExecutable(string name) => (Environment.GetEnvironmentVariable("PATH") ?? "").Split(Path.PathSeparator)
        .Select(p => Path.Combine(p, name)).FirstOrDefault(File.Exists);

    public static async Task RunAsync(Options options, CancellationToken token)
    {
        string workspace = Path.GetFullPath(options.Value("workspace", Environment.CurrentDirectory));
        string thread = options.Value("thread", ""), codex = options.Value("codex", "codex"), voice = options.Value("voice", "");
        string input = options.Value("input-device", "default"), output = options.Value("output-device", "default");
        string directory = options.Value("data-dir", StateStore.DefaultDirectory);
        bool stdio = options.Flag("pcm-stdio"), tools = options.Flag("remote-tools"), native = options.Flag("native"); options.Validate([]);
        if (!Directory.Exists(workspace)) throw new ArgumentException("--workspace does not exist.");
        if (thread.Length != 0 && !Guid.TryParse(thread, out _)) throw new ArgumentException("--thread must be an existing Codex thread UUID.");
        if (tools && thread.Length != 0 && !native) throw new ArgumentException("--remote-tools requires a new voice thread so its restricted tools can be registered.");
        if (native)
        {
            if (stdio || voice.Length != 0 || input != "default" || output != "default")
                throw new ArgumentException("--native uses Codex's own audio/settings; bridge options cannot be combined with it.");
            if (Console.IsInputRedirected || Console.IsOutputRedirected) throw new InvalidOperationException("--native requires an interactive terminal. Over SSH, allocate a TTY with ssh -t.");
            Console.Error.WriteLine("Opening Codex. Enter /voice to start, /voice mute to mute, /voice stop to finish. Native voice depends on Codex account/platform availability.");
            var nativeInfo = new ProcessStartInfo(codex) { WorkingDirectory = workspace, UseShellExecute = false };
            foreach (string arg in new[] { "--no-daemon", "--enable", "in_app_voice", "--sandbox", "read-only", "--ask-for-approval", "never", "--cd", workspace }) nativeInfo.ArgumentList.Add(arg);
            if (tools)
            {
                string host = Environment.ProcessPath ?? throw new InvalidOperationException("Cannot locate CLI executable.");
                string[] toolArgs = Path.GetFileNameWithoutExtension(host) == "dotnet"
                    ? [Path.Combine(AppContext.BaseDirectory, "flownote-remote.dll"), "mcp", "--data-dir", Path.GetFullPath(directory)] : ["mcp", "--data-dir", Path.GetFullPath(directory)];
                foreach (string arg in new[] { "-c", "mcp_servers.flownote_remote.command=" + JsonSerializer.Serialize(host),
                    "-c", "mcp_servers.flownote_remote.args=" + JsonSerializer.Serialize(toolArgs) }) nativeInfo.ArgumentList.Add(arg);
            }
            if (thread.Length > 0) { nativeInfo.ArgumentList.Add("resume"); nativeInfo.ArgumentList.Add(thread); }
            using var process = Process.Start(nativeInfo) ?? throw new InvalidOperationException("Cannot start Codex.");
            try { await process.WaitForExitAsync(token); if (process.ExitCode != 0) throw new InvalidOperationException("Codex terminal exited with code " + process.ExitCode); }
            finally { if (!process.HasExited) process.Kill(true); }
            return;
        }
        if (!stdio && (!OperatingSystem.IsLinux() || FindExecutable("arecord") is null || FindExecutable("aplay") is null))
            throw new InvalidOperationException("Install alsa-utils for microphone/speaker access, or use --pcm-stdio over SSH.");
        await CodexRpc.CheckSchemaAsync(codex, token);
        using var session = CancellationTokenSource.CreateLinkedTokenSource(token);
        await using var rpc = new CodexRpc(codex, workspace);
        Process? capture = null;
        bool started = false;
        Task events = Task.CompletedTask;
        var ready = new TaskCompletionSource(TaskCreationOptions.RunContinuationsAsynchronously);
        await using var audio = new AudioOutput(stdio, output);
        try
        {
            // Start draining before initialize: notifications and responses share the same pipe.
            events = ConsumeAsync(rpc, audio, () => thread, session, ready);
            rpc.ServerRequest = async message =>
            {
                var parameters = message.GetProperty("params");
                if (message.GetProperty("method").GetString() != "item/tool/call" || !tools ||
                    parameters.GetProperty("threadId").GetString() != thread || parameters.GetProperty("tool").GetString() != "flownote_remote")
                    throw new InvalidOperationException("Unsupported or unapproved server request.");
                string result = await MediaTools.CallAsync(directory, parameters.GetProperty("arguments"), session.Token);
                return new { contentItems = new[] { new { type = "inputText", text = result } }, success = !result.StartsWith("ERROR:", StringComparison.Ordinal) };
            };
            await rpc.RequestAsync("initialize", new { clientInfo = new { name = "flownote_remote_cli", version = "0.4.0" },
                capabilities = new { experimentalApi = true } }, session.Token);
            await rpc.NotifyAsync("initialized", new { }, session.Token);
            var parameters = new Dictionary<string, object> { ["cwd"] = workspace, ["sandbox"] = "read-only", ["approvalPolicy"] = "never" };
            if (thread.Length != 0) parameters["threadId"] = thread;
            else
            {
                parameters["developerInstructions"] = "Speak Korean by default. This is a Flownote Remote voice session. Explain results concisely. Do not claim a device command succeeded until actual device state confirms it.";
                if (tools) parameters["dynamicTools"] = new[] { new { type = "function", name = "flownote_remote",
                    description = MediaTools.Description, inputSchema = MediaTools.InputSchema } };
            }
            var result = await rpc.RequestAsync(thread.Length == 0 ? "thread/start" : "thread/resume", parameters, session.Token);
            thread = result.GetProperty("thread").GetProperty("id").GetString() ?? throw new InvalidOperationException("Codex returned no thread.");
            Console.Error.WriteLine("Codex voice thread: " + thread);
            var start = new Dictionary<string, object> { ["threadId"] = thread, ["outputModality"] = "audio", ["version"] = "v3", ["transport"] = new { type = "websocket" } };
            if (voice.Length > 0) start["voice"] = voice;
            await rpc.RequestAsync("thread/realtime/start", start, session.Token);
            started = true;
            await ready.Task.WaitAsync(TimeSpan.FromSeconds(45), session.Token);
            // Only open the microphone after the backend accepts voice startup.
            Stream source;
            if (stdio) source = Console.OpenStandardInput();
            else { capture = StartAlsa("arecord", input, false); source = capture.StandardOutput.BaseStream; }
            Console.Error.WriteLine("Voice connected · PCM16LE/24000Hz/mono · Ctrl+C or input EOF ends the session.");
                var buffer = new byte[2400]; // 50 ms; one request at a time bounds buffered capture.
                int tail = 0;
                while (!session.IsCancellationRequested)
                {
                    int count = await source.ReadAsync(buffer.AsMemory(tail, buffer.Length - tail), session.Token).AsTask().WaitAsync(session.Token);
                    if (count == 0) { if (tail != 0) throw new IOException("Truncated PCM16 input sample."); break; }
                    count += tail;
                    int even = count & ~1;
                    if (even > 0) await rpc.RequestAsync("thread/realtime/appendAudio", new { threadId = thread,
                        audio = new { data = Convert.ToBase64String(buffer, 0, even), sampleRate = SampleRate, numChannels = 1, samplesPerChannel = even / 2 } }, session.Token);
                    tail = count - even; if (tail != 0) buffer[0] = buffer[even];
                }
                if (capture is not null && capture.HasExited && capture.ExitCode != 0) throw new IOException("Microphone capture failed. Check arecord -L and --input-device.");
        }
        catch (OperationCanceledException) when (!token.IsCancellationRequested) { await events; }
        finally
        {
            if (capture is not null) { if (!capture.HasExited) capture.Kill(true); await capture.WaitForExitAsync(); capture.Dispose(); }
            if (started)
            {
                using var timeout = new CancellationTokenSource(TimeSpan.FromSeconds(3));
                try
                {
                    await rpc.RequestAsync("thread/realtime/stop", new { threadId = thread }, timeout.Token);
                    await events.WaitAsync(TimeSpan.FromSeconds(1), timeout.Token);
                }
                catch (Exception e) when (e is IOException or InvalidOperationException or OperationCanceledException or TimeoutException) { }
            }
            session.Cancel();
            try { await events; } catch (OperationCanceledException) { }
        }
    }
    private static async Task ConsumeAsync(CodexRpc rpc, AudioOutput output, Func<string> thread, CancellationTokenSource session, TaskCompletionSource ready)
    {
        try
        {
            await foreach (var message in rpc.Events.Reader.ReadAllAsync(session.Token))
            {
                string method = message.GetProperty("method").GetString() ?? "";
                if (!message.TryGetProperty("params", out var data)) continue;
                if (!data.TryGetProperty("threadId", out var id) || id.GetString() != thread()) continue;
                switch (method)
                {
                    case "thread/realtime/started": ready.TrySetResult(); break;
                    case "thread/realtime/outputAudio/delta": await output.WriteAsync(data.GetProperty("audio"), session.Token); break;
                    case "thread/realtime/transcript/done":
                        Console.Error.WriteLine($"[{data.GetProperty("role").GetString()}] {data.GetProperty("text").GetString()}"); break;
                    case "thread/realtime/error": throw new InvalidOperationException("Codex voice: " + data.GetProperty("message").GetString());
                    case "thread/realtime/closed":
                        Console.Error.WriteLine("Codex voice session closed."); return;
                }
            }
        }
        finally { session.Cancel(); }
    }
    private static Process StartAlsa(string name, string device, bool playback)
    {
        var info = new ProcessStartInfo(name) { UseShellExecute = false, RedirectStandardError = true,
            RedirectStandardInput = playback, RedirectStandardOutput = !playback };
        foreach (string arg in new[] { "-q", "-D", device, "-t", "raw", "-f", "S16_LE", "-r", SampleRate.ToString(), "-c", "1" }) info.ArgumentList.Add(arg);
        var process = Process.Start(info) ?? throw new InvalidOperationException("Cannot start " + name);
        _ = Task.Run(async () => { while (await process.StandardError.ReadLineAsync() is not null) { } });
        return process;
    }
    public sealed class AudioOutput(bool stdio, string device) : IAsyncDisposable
    {
        private Process? playback;
        private Stream? stream;
        public async Task WriteAsync(JsonElement audio, CancellationToken token)
        {
            if (audio.GetProperty("sampleRate").GetInt32() != SampleRate || audio.GetProperty("numChannels").GetInt32() != 1)
                throw new InvalidOperationException("Unexpected Codex output format; expected 24 kHz mono PCM16.");
            string encoded = audio.GetProperty("data").GetString() ?? "";
            if (encoded.Length > 1398104) throw new IOException("Audio chunk exceeds 1 MiB.");
            byte[] bytes = Convert.FromBase64String(encoded);
            if (bytes.Length % 2 != 0) throw new IOException("Truncated PCM16 output sample.");
            if (stream is null)
            {
                if (stdio) stream = Console.OpenStandardOutput();
                else { playback = StartAlsa("aplay", device, true); stream = playback.StandardInput.BaseStream; }
            }
            await stream.WriteAsync(bytes, token); await stream.FlushAsync(token);
        }
        public async ValueTask DisposeAsync()
        {
            if (playback is null) return;
            playback.StandardInput.Close();
            try { await playback.WaitForExitAsync().WaitAsync(TimeSpan.FromSeconds(2)); }
            catch (TimeoutException) { if (!playback.HasExited) playback.Kill(true); }
            playback.Dispose();
        }
    }
}
