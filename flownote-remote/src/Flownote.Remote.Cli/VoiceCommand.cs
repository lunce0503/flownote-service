using System.Diagnostics;
using System.Text.Json;
using Flownote.Remote.Network;

namespace Flownote.Remote.Cli;

public static class VoiceCommand
{
    public const int SampleRate = 24000;
    private static async Task InitializeAccountAsync(CodexRpc rpc, CancellationToken token)
    {
        await rpc.RequestAsync("initialize", new { clientInfo = new { name = "flownote_remote_cli", version = "0.5.1" },
            capabilities = new { experimentalApi = true } }, token);
        await rpc.NotifyAsync("initialized", new { }, token);
        var account = await rpc.RequestAsync("account/read", new { refreshToken = false }, token);
        if (!account.TryGetProperty("account", out var identity) || identity.ValueKind != JsonValueKind.Object ||
            !identity.TryGetProperty("type", out var type) || type.GetString() != "chatgpt")
            throw new InvalidOperationException("A Codex ChatGPT account login is required. Run codex login --device-auth. API-key fallback is disabled.");
    }
    public static async Task<int> DoctorAsync(Options options, CancellationToken token)
    {
        string codex = options.Value("codex", "codex"); options.Validate([]);
        await CodexRpc.CheckSchemaAsync(codex, token);
        Console.WriteLine("PASS: Codex account WebRTC voice protocol (experimental)");
        await using (var rpc = new CodexRpc(codex, Environment.CurrentDirectory)) await InitializeAccountAsync(rpc, token);
        Console.WriteLine("PASS: signed-in Codex ChatGPT account; no API key used");
        foreach (string tool in new[] { "node", "arecord", "aplay" })
            Console.WriteLine(FindExecutable(tool) is null ? "MISSING: " + tool + " (see docs/CLI.md)" : "PASS: " + tool);
        Console.WriteLine("WebRTC requires Node 24 and pinned Playwright Chromium. Account voice access and media connectivity are verified at session start.");
        return 0;
    }
    private static string? FindExecutable(string name) => (Environment.GetEnvironmentVariable("PATH") ?? "").Split(Path.PathSeparator)
        .Select(p => Path.Combine(p, name)).FirstOrDefault(File.Exists);

    public static async Task RunAsync(Options options, CancellationToken token)
    {
        string workspace = Path.GetFullPath(options.Value("workspace", Environment.CurrentDirectory));
        string thread = options.Value("thread", ""), codex = options.Value("codex", "codex"), voice = options.Value("voice", "");
        string input = options.Value("input-device", "default"), output = options.Value("output-device", "default");
        string directory = options.Value("data-dir", StateStore.DefaultDirectory);
        string root = options.Value("voice-root", AppContext.BaseDirectory), node = options.Value("node", "node"), message = options.Value("message", "");
        bool stdio = options.Flag("pcm-stdio"), tools = options.Flag("remote-tools"), native = options.Flag("native"); options.Validate([]);
        if (!Directory.Exists(workspace)) throw new ArgumentException("--workspace does not exist.");
        if (message.Length > 2000) throw new ArgumentException("--message must be at most 2000 characters.");
        if (thread.Length != 0 && !Guid.TryParse(thread, out _)) throw new ArgumentException("--thread must be an existing Codex thread UUID.");
        if (tools && thread.Length != 0 && !native) throw new ArgumentException("--remote-tools requires a new voice thread so its restricted tools can be registered.");
        if (native)
        {
            if (stdio || voice.Length != 0 || input != "default" || output != "default" || message.Length != 0)
                throw new ArgumentException("--native uses Codex's own audio/settings; bridge options cannot be combined with it.");
            if (Console.IsInputRedirected || Console.IsOutputRedirected) throw new InvalidOperationException("--native requires an interactive terminal. Over SSH, allocate a TTY with ssh -t.");
            await using (var account = new CodexRpc(codex, workspace)) await InitializeAccountAsync(account, token);
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
            CodexRpc.UseAccountCredentials(nativeInfo);
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
        await using var audio = new AudioOutput(stdio, output);
        WebRtcAudio? media = null; Process? capture = null;
        bool started = false;
        var backendReady = new TaskCompletionSource(TaskCreationOptions.RunContinuationsAsynchronously);
        var mediaReady = new TaskCompletionSource(TaskCreationOptions.RunContinuationsAsynchronously);
        Task mediaEvents = Task.CompletedTask;
        Task registration = Task.CompletedTask;
        Task events = ConsumeRpcAsync(rpc, () => media, () => thread, session, backendReady);
        try
        {
            rpc.ServerRequest = async request =>
            {
                var data = request.GetProperty("params");
                if (request.GetProperty("method").GetString() != "item/tool/call" || !tools ||
                    data.GetProperty("threadId").GetString() != thread || data.GetProperty("tool").GetString() != "flownote_remote")
                    throw new InvalidOperationException("Unsupported or unapproved server request.");
                string result = await MediaTools.CallAsync(directory, data.GetProperty("arguments"), session.Token);
                return new { contentItems = new[] { new { type = "inputText", text = result } }, success = !result.StartsWith("ERROR:", StringComparison.Ordinal) };
            };
            await InitializeAccountAsync(rpc, session.Token);
            Console.Error.WriteLine("Using the account signed in to Codex CLI · WebRTC · no API key");
            media = new WebRtcAudio(root, node);
            mediaEvents = ConsumeMediaAsync(media, audio, session, mediaReady);
            string offer = await media.Offer.Task.WaitAsync(TimeSpan.FromSeconds(45), session.Token);
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
            var start = new Dictionary<string, object> { ["threadId"] = thread, ["outputModality"] = "audio", ["version"] = "v3",
                ["transport"] = new { type = "webrtc", sdp = offer } };
            if (voice.Length > 0) start["voice"] = voice;
            await rpc.RequestAsync("thread/realtime/start", start, session.Token); started = true;
            await Task.WhenAll(backendReady.Task, mediaReady.Task).WaitAsync(TimeSpan.FromSeconds(60), session.Token);
            registration = RegisterTaskAsync(directory, thread, session.Token);
            // Account acceptance AND actual WebRTC connectivity must precede microphone capture.
            Stream source;
            if (stdio) source = Console.OpenStandardInput();
            else { capture = StartAlsa("arecord", input, false); source = capture.StandardOutput.BaseStream; }
            Console.Error.WriteLine("Voice connected · Codex account/WebRTC · PCM16LE/24000Hz/mono · Ctrl+C or input EOF ends the session.");
            if (message.Length > 0) await rpc.RequestAsync("thread/realtime/appendText", new { threadId = thread, text = message }, session.Token);
            var buffer = new byte[2400]; int tail = 0; long samples = 0; var clock = Stopwatch.StartNew();
            while (!session.IsCancellationRequested)
            {
                int count = await source.ReadAsync(buffer.AsMemory(tail, buffer.Length - tail), session.Token).AsTask().WaitAsync(session.Token);
                if (count == 0) { if (tail != 0) throw new IOException("Truncated PCM16 input sample."); break; }
                count += tail; int even = count & ~1;
                if (even > 0)
                {
                    await media.InputAsync(buffer, even, session.Token); samples += even / 2;
                    TimeSpan pace = TimeSpan.FromSeconds(samples / (double)SampleRate) - clock.Elapsed;
                    if (pace > TimeSpan.Zero) await Task.Delay(pace, session.Token);
                }
                tail = count - even; if (tail != 0) buffer[0] = buffer[even];
            }
            if (capture is not null)
            {
                await capture.WaitForExitAsync().WaitAsync(TimeSpan.FromSeconds(2));
                if (capture.ExitCode != 0) throw new IOException("Microphone capture failed. Check arecord -L and --input-device.");
            }
        }
        catch (OperationCanceledException) when (!token.IsCancellationRequested) { await ObserveAsync(events, mediaEvents); }
        finally
        {
            if (capture is not null) { if (!capture.HasExited) capture.Kill(true); await capture.WaitForExitAsync(); capture.Dispose(); }
            if (started)
            {
                using var timeout = new CancellationTokenSource(TimeSpan.FromSeconds(3));
                try { await rpc.RequestAsync("thread/realtime/stop", new { threadId = thread }, timeout.Token); }
                catch (Exception e) when (e is IOException or InvalidOperationException or OperationCanceledException or TimeoutException) { }
            }
            session.Cancel();
            await registration;
            if (started) await UpdateTaskAsync(directory, ["task.remove", thread], CancellationToken.None);
            if (media is not null) await media.DisposeAsync();
            await ObserveAsync(events, mediaEvents);
        }
    }
    private static async Task RegisterTaskAsync(string directory, string thread, CancellationToken token)
    {
        var task = new RemoteTask(Guid.Parse(thread), "Codex 음성");
        try
        {
            do
            {
                await UpdateTaskAsync(directory, ["task.upsert", JsonSerializer.Serialize(task, Protocol.Json)], token);
                await Task.Delay(TimeSpan.FromSeconds(20), token);
            } while (!token.IsCancellationRequested);
        }
        catch (OperationCanceledException) when (token.IsCancellationRequested) { }
    }
    private static async Task UpdateTaskAsync(string directory, string[] command, CancellationToken token)
    {
        // Optional owner socket: standalone voice works without a running local server.
        if (!OperatingSystem.IsLinux() || !File.Exists(LocalControl.SocketPath(directory))) return;
        using var timeout = CancellationTokenSource.CreateLinkedTokenSource(token); timeout.CancelAfter(TimeSpan.FromSeconds(1));
        try { await LocalControl.CallAsync(directory, command, timeout.Token); }
        catch (Exception e) when (e is IOException or System.Net.Sockets.SocketException or UnauthorizedAccessException or
            ArgumentException or InvalidOperationException or OperationCanceledException or TimeoutException) { }
    }
    private static async Task ObserveAsync(params Task[] tasks)
    { foreach (var task in tasks) try { await task; } catch (OperationCanceledException) { } }
    private static async Task ConsumeRpcAsync(CodexRpc rpc, Func<WebRtcAudio?> media, Func<string> thread,
        CancellationTokenSource session, TaskCompletionSource ready)
    {
        string lastTranscript = "";
        void Transcript(string? role, string? text)
        {
            if (string.IsNullOrEmpty(text)) return;
            string key = role + ":" + text;
            if (key == lastTranscript) return;
            lastTranscript = key;
            Console.Error.WriteLine($"[{role}] {text}");
        }
        try
        {
            await foreach (var message in rpc.Events.Reader.ReadAllAsync(session.Token))
            {
                string method = message.GetProperty("method").GetString() ?? "";
                if (!message.TryGetProperty("params", out var data) || !data.TryGetProperty("threadId", out var id) || id.GetString() != thread()) continue;
                switch (method)
                {
                    case "thread/realtime/started": ready.TrySetResult(); break;
                    case "thread/realtime/sdp":
                        string sdp = data.GetProperty("sdp").GetString() ?? "";
                        if (sdp.Length is < 1 or > 65536) throw new InvalidOperationException("Invalid Codex WebRTC answer.");
                        await (media() ?? throw new InvalidOperationException("No WebRTC media worker.")).AnswerAsync(sdp, session.Token); break;
                    case "thread/realtime/transcript/done":
                        Transcript(data.GetProperty("role").GetString(), data.GetProperty("text").GetString()); break;
                    case "thread/realtime/item/completed":
                        var item = data.GetProperty("item");
                        if (item.GetProperty("type").GetString() == "transcriptSegment")
                            Transcript(item.GetProperty("role").GetString(), item.GetProperty("text").GetString());
                        break;
                    case "thread/realtime/error": throw new InvalidOperationException("Codex voice: " + data.GetProperty("message").GetString());
                    case "thread/realtime/closed": Console.Error.WriteLine("Codex voice session closed."); return;
                }
            }
        }
        finally { session.Cancel(); }
    }
    private static async Task ConsumeMediaAsync(WebRtcAudio media, AudioOutput output, CancellationTokenSource session, TaskCompletionSource ready)
    {
        try
        {
            await foreach (var data in media.Events.Reader.ReadAllAsync(session.Token))
                switch (data.GetProperty("type").GetString())
                {
                    case "connected": ready.TrySetResult(); break;
                    case "audio": await output.WriteAsync(data, session.Token); break;
                    case "interrupt": await output.InterruptAsync(); break;
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
        public async Task InterruptAsync()
        {
            if (playback is null) return; // A remote PCM consumer owns its own playback buffer.
            if (!playback.HasExited) playback.Kill(true);
            await playback.WaitForExitAsync(); playback.Dispose(); playback = null; stream = null;
        }
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
            if (stdio)
            {
                // Console stdout may block synchronously inside WriteAsync on Unix.
                // Keep that write off the media reader so SIGTERM/remote errors can cancel it.
                Stream destination = stream;
                await Task.Run(() => destination.Write(bytes), CancellationToken.None).WaitAsync(token);
            }
            else await stream.WriteAsync(bytes, token).AsTask().WaitAsync(token);
            await stream.FlushAsync(token).WaitAsync(token);
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
