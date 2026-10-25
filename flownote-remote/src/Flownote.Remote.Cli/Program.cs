using Flownote.Remote.Cli;

return await Cli.RunAsync(args);

namespace Flownote.Remote.Cli
{
    public static class Cli
    {
        public const string Help = """
            Flownote Remote CLI — Linux HTTPS/WSS server and Codex voice

            flownote-remote server --listen <private IPv4> [--port 17843]
                [--data-dir PATH]
            flownote-remote status|invite|devices|tasks [--data-dir PATH]
            flownote-remote allow|pause|revoke <device UUID> [--data-dir PATH]
            flownote-remote target|voice-target <device UUID> [--data-dir PATH]
            flownote-remote gestures on|off [--data-dir PATH]
            flownote-remote volume-up|volume-down|mute|unmute <device UUID> [--data-dir PATH]

            flownote-remote voice [--workspace PATH] [--thread UUID] [--codex PATH]
                [--input-device default] [--output-device default] [--voice NAME]
                [--native | --pcm-stdio] [--remote-tools] [--data-dir PATH]
                [--voice-root PATH] [--node PATH] [--message TEXT]
            flownote-remote doctor [--codex PATH]
            flownote-remote mcp [--data-dir PATH]  # restricted media tools over stdio

            server: private/VPN IPv4 only; gestures start OFF. Manage through the
            owner's local Unix socket. Clients extract skeletons; server needs no
            Node/model/browser. invite prints a 2-minute one-time link.
            voice --native: open Codex's own terminal; enter /voice there. Uses
            Codex's account/voice availability and native audio devices.
            voice: use the account signed in to Codex CLI through WebRTC.
            No API key or API-key fallback. Install Node 24 + pinned Playwright
            Chromium; microphone/speaker use ALSA arecord/aplay.
            --pcm-stdio: PCM16LE, 24 kHz, mono stdin/stdout (e.g. over SSH).
            All voice status/transcripts go to stderr. Ctrl+C or EOF stops capture.
            --remote-tools: allow voice to inspect connected clients and control
            their volume/mute through this user's local server. No admin tools.
            """;

        public static async Task<int> RunAsync(string[] args)
        {
            if (args.Length == 0 || args[0] is "help" or "--help" or "-h") { Console.WriteLine(Help); return 0; }
            using var stop = new CancellationTokenSource();
            Console.CancelKeyPress += (_, e) => { e.Cancel = true; stop.Cancel(); };
            using var signal = OperatingSystem.IsLinux() ? System.Runtime.InteropServices.PosixSignalRegistration.Create(
                System.Runtime.InteropServices.PosixSignal.SIGTERM, e => { e.Cancel = true; stop.Cancel(); }) : null;
            try
            {
                var options = new Options(args.Skip(1).ToArray());
                switch (args[0])
                {
                    case "server": await ServerCommand.RunAsync(options, stop.Token); break;
                    case "voice": await VoiceCommand.RunAsync(options, stop.Token); break;
                    case "mcp": await MediaTools.RunMcpAsync(options, stop.Token); break;
                    case "doctor": return await VoiceCommand.DoctorAsync(options, stop.Token);
                    default:
                        string directory = options.Value("data-dir", StateStore.DefaultDirectory);
                        options.Validate();
                        string response = await LocalControl.CallAsync(directory, [args[0], .. options.Positionals], stop.Token);
                        Console.WriteLine(response);
                        return response.StartsWith("ERROR:", StringComparison.Ordinal) ? 1 : 0;
                }
                return 0;
            }
            catch (OperationCanceledException) when (stop.IsCancellationRequested) { return 0; }
            catch (Exception e) when (e is ArgumentException or InvalidOperationException or IOException or
                System.Net.Sockets.SocketException or System.ComponentModel.Win32Exception or TimeoutException or
                System.Security.Cryptography.CryptographicException or UnauthorizedAccessException or System.Text.Json.JsonException or FormatException or KeyNotFoundException)
            {
                Console.Error.WriteLine("ERROR: " + e.Message); return 1;
            }
        }
    }

    public sealed class Options
    {
        private readonly Dictionary<string, string> values = new(StringComparer.Ordinal);
        private readonly HashSet<string> used = new(StringComparer.Ordinal);
        private static readonly HashSet<string> Flags = ["no-vision", "pcm-stdio", "remote-tools", "native"];
        public List<string> Positionals { get; } = [];
        public Options(string[] args)
        {
            for (int i = 0; i < args.Length; i++)
            {
                if (!args[i].StartsWith("--", StringComparison.Ordinal)) { Positionals.Add(args[i]); continue; }
                string name = args[i][2..];
                string value = Flags.Contains(name) ? "true" : ++i < args.Length && !args[i].StartsWith("--", StringComparison.Ordinal)
                    ? args[i] : throw new ArgumentException("Missing value for --" + name);
                if (!values.TryAdd(name, value)) throw new ArgumentException("Duplicate option --" + name);
            }
        }
        public string Value(string name, string fallback) { used.Add(name); return values.GetValueOrDefault(name, fallback); }
        public bool Flag(string name) => Value(name, "false") == "true";
        public void Validate(string[]? positionals = null)
        {
            if (values.Keys.Any(k => !used.Contains(k))) throw new ArgumentException("Unknown option --" + values.Keys.First(k => !used.Contains(k)));
            if (positionals is not null && Positionals.Count != positionals.Length) throw new ArgumentException("Unexpected arguments. Run flownote-remote help.");
        }
    }
}
