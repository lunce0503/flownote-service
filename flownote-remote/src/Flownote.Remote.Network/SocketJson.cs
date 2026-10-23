using System.Net.WebSockets;
using System.Text.Json;

namespace Flownote.Remote.Network;

internal static class SocketJson
{
    public static async Task<JsonDocument?> ReceiveAsync(WebSocket socket, CancellationToken cancellation)
    {
        byte[] buffer = new byte[Protocol.MaxMessageBytes];
        int length = 0;
        using var timeout = CancellationTokenSource.CreateLinkedTokenSource(cancellation);
        timeout.CancelAfter(TimeSpan.FromSeconds(15));
        while (true)
        {
            var result = await socket.ReceiveAsync(buffer.AsMemory(length), timeout.Token);
            if (result.MessageType == WebSocketMessageType.Close) return null;
            if (result.MessageType != WebSocketMessageType.Text) throw new ArgumentException("JSON 메시지가 필요합니다.");
            length += result.Count;
            if (result.EndOfMessage) return JsonDocument.Parse(buffer.AsMemory(0, length), new JsonDocumentOptions { MaxDepth = 12 });
            if (length == buffer.Length) throw new ArgumentException("메시지가 너무 큽니다.");
        }
    }

    public static async Task SendAsync(WebSocket socket, SemaphoreSlim writer, object message, CancellationToken cancellation)
    {
        byte[] bytes = JsonSerializer.SerializeToUtf8Bytes(message, Protocol.Json);
        using var timeout = CancellationTokenSource.CreateLinkedTokenSource(cancellation);
        timeout.CancelAfter(TimeSpan.FromSeconds(4));
        await writer.WaitAsync(timeout.Token);
        try { await socket.SendAsync(bytes.AsMemory(), WebSocketMessageType.Text, true, timeout.Token); }
        finally { writer.Release(); }
    }
}
