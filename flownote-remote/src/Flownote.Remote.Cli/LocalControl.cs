using System.Net.Sockets;
using System.Text;
using System.Text.Json;

namespace Flownote.Remote.Cli;

public static class LocalControl
{
    public static string SocketPath(string directory)
    {
        string path = Path.Combine(Path.GetFullPath(directory), "owner.sock");
        if (Encoding.UTF8.GetByteCount(path) > 100) throw new ArgumentException("--data-dir is too long for a Unix socket.");
        return path;
    }
    public static async Task<string> ReadLineAsync(Stream stream, CancellationToken token)
    {
        var data = new List<byte>(); byte[] b = new byte[1];
        while (await stream.ReadAsync(b, token) != 0)
        {
            if (b[0] == '\n') return Encoding.UTF8.GetString(data.ToArray());
            if (data.Count >= 65536) throw new IOException("Control message is too large.");
            data.Add(b[0]);
        }
        throw new IOException("Control connection closed before response.");
    }
    public static async Task<string> CallAsync(string directory, string[] command, CancellationToken token)
    {
        if (!OperatingSystem.IsLinux()) throw new InvalidOperationException("Owner commands require the Linux server's local Unix socket. Use SSH for remote administration.");
        StateStore.VerifyPrivate(Path.GetFullPath(directory), true);
        StateStore.VerifyPrivate(SocketPath(directory));
        using var timeout = CancellationTokenSource.CreateLinkedTokenSource(token); timeout.CancelAfter(TimeSpan.FromSeconds(8));
        using var socket = new Socket(AddressFamily.Unix, SocketType.Stream, ProtocolType.Unspecified);
        try
        {
            await socket.ConnectAsync(new UnixDomainSocketEndPoint(SocketPath(directory)), timeout.Token);
            using var stream = new NetworkStream(socket);
            await stream.WriteAsync(Encoding.UTF8.GetBytes(JsonSerializer.Serialize(command) + "\n"), timeout.Token);
            return await ReadLineAsync(stream, timeout.Token);
        }
        catch (OperationCanceledException) when (!token.IsCancellationRequested) { throw new TimeoutException("Owner socket did not respond within 8 seconds."); }
    }
    public static async Task ServeAsync(Socket listener, Func<string[], Task<string>> command, CancellationToken token)
    {
        while (!token.IsCancellationRequested)
        {
            using var socket = await listener.AcceptAsync(token);
            using var stream = new NetworkStream(socket);
            using var timeout = CancellationTokenSource.CreateLinkedTokenSource(token); timeout.CancelAfter(TimeSpan.FromSeconds(5));
            try
            {
                string text = await ReadLineAsync(stream, timeout.Token);
                var words = JsonSerializer.Deserialize<string[]>(text) ?? throw new ArgumentException("Missing command");
                string result;
                try { result = await command(words); }
                catch (Exception e) when (e is ArgumentException or InvalidOperationException) { result = "ERROR: " + e.Message; }
                await stream.WriteAsync(Encoding.UTF8.GetBytes(result.Replace('\n', ' ').Replace('\r', ' ') + "\n"), timeout.Token);
            }
            catch (Exception e) when (e is IOException or OperationCanceledException or JsonException or ArgumentException or SocketException) { }
        }
    }
}
