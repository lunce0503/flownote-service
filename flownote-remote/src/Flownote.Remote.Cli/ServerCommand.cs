using System.Net;
using System.Net.Sockets;
using System.Text.Json;
using Flownote.Remote.Network;

namespace Flownote.Remote.Cli;

public static class ServerCommand
{
    public static async Task RunAsync(Options options, CancellationToken token)
    {
        string addressText = options.Value("listen", "127.0.0.1");
        string portText = options.Value("port", Protocol.Port.ToString());
        string directory = options.Value("data-dir", StateStore.DefaultDirectory);
        bool noVision = options.Flag("no-vision");
        string root = options.Value("vision-root", AppContext.BaseDirectory);
        options.Validate([]);
        if (!IPAddress.TryParse(addressText, out var address) || address.AddressFamily != AddressFamily.InterNetwork || !Protocol.IsPrivate(address))
            throw new ArgumentException("--listen must be a private/VPN IPv4 address; 0.0.0.0/public addresses are not accepted.");
        if (!int.TryParse(portText, out int port) || port is < 0 or > 65535) throw new ArgumentException("Invalid --port.");
        var store = new StateStore(directory);
        // An exclusive file lock prevents a second server from replacing the live owner's socket or identity.
        string lockPath = Path.Combine(store.DirectoryPath, "server.lock");
        if (!OperatingSystem.IsLinux()) throw new InvalidOperationException();
        using var fileLock = new FileStream(lockPath, new FileStreamOptions { Mode = FileMode.OpenOrCreate, Access = FileAccess.ReadWrite,
            Share = FileShare.None, UnixCreateMode = UnixFileMode.UserRead | UnixFileMode.UserWrite });
        StateStore.VerifyPrivate(lockPath);
        string socketPath = LocalControl.SocketPath(store.DirectoryPath);
        using var listener = new Socket(AddressFamily.Unix, SocketType.Stream, ProtocolType.Unspecified);
        if (File.Exists(socketPath)) { StateStore.VerifyPrivate(socketPath); File.Delete(socketPath); }
        using var certificate = store.Certificate(address);
        await using var vision = noVision ? null : await VisionWorker.StartAsync(root, token);
        var settings = store.Settings();
        // A daemon restart must not silently re-arm camera commands.
        settings.GesturesEnabled = false;
        await using var hub = new RemoteHub(settings, frame => vision is null ? Task.FromResult(new GestureSample(null, 0)) : vision.InferAsync(frame),
            store.Grants(), new(CameraFrames: !noVision, GestureRecognition: !noVision));
        hub.GrantsChanged += store.SaveGrants;
        hub.Activity += message => Console.Error.WriteLine(message);
        try
        {
            listener.Bind(new UnixDomainSocketEndPoint(socketPath));
            File.SetUnixFileMode(socketPath, UnixFileMode.UserRead | UnixFileMode.UserWrite);
            listener.Listen(4);
            await hub.StartAsync(address, port, certificate);
            Console.Error.WriteLine($"READY {hub.Address} · SHA256 {Protocol.Pin(certificate)} · gestures OFF");
            Console.Error.WriteLine("Use another terminal: flownote-remote invite / devices / gestures on. Ctrl+C stops the server.");
            await LocalControl.ServeAsync(listener, async words =>
            {
                if (words.Length == 0 || words.Length > 2 || words.Any(w => w is null)) throw new ArgumentException("Invalid command.");
                switch (words[0])
                {
                    case "status" or "devices" when words.Length == 1: return JsonSerializer.Serialize(hub.Snapshot(), Protocol.Json);
                    case "invite" when words.Length == 1:
                        hub.RenewPairing(); return hub.Invitation(Protocol.Pin(certificate)).Encode();
                    case "gestures" when words.Length == 2 && words[1] is "on" or "off":
                        if (noVision && words[1] == "on") throw new InvalidOperationException("Restart with vision configured before enabling gestures.");
                        settings.GesturesEnabled = words[1] == "on"; hub.Configure(settings); store.SaveSettings(settings); return "OK: gestures " + words[1];
                }
                if (words.Length != 2 || !Guid.TryParse(words[1], out Guid id) || !hub.RegisteredDevices().Any(d => d.Id == id))
                    throw new ArgumentException("Specify a registered device UUID. Run devices.");
                switch (words[0])
                {
                    case "allow": await hub.SetDeviceAllowedAsync(id, true); break;
                    case "pause": await hub.SetDeviceAllowedAsync(id, false); break;
                    case "revoke": hub.Revoke(id); break;
                    case "target": hub.SelectTargets(id, hub.Snapshot().VoiceTarget); break;
                    case "voice-target": hub.SelectTargets(hub.Snapshot().GestureTarget, id); break;
                    case "volume-up" or "volume-down" or "mute" or "unmute":
                        if (!hub.Snapshot().Devices.Any(d => d.Id == id && d.Connected && d.Enabled && d.OutputReady))
                            throw new InvalidOperationException("The output client is offline, paused or has no output device.");
                        await hub.ExecuteAsync(id, words[0].Replace('-', '_'), Guid.NewGuid()); return "QUEUED: awaiting the client's output acknowledgement; inspect devices for actual state.";
                    default: throw new ArgumentException("Unknown owner command.");
                }
                return "OK";
            }, token);
        }
        finally { listener.Close(); if (File.Exists(socketPath)) File.Delete(socketPath); }
    }
}
