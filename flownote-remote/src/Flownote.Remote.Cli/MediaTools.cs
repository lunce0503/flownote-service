using System.Text.Json;

namespace Flownote.Remote.Cli;

public static class MediaTools
{
    public const string Description = "List Flownote clients or queue a volume/mute command explicitly requested by the user. Inspect devices again to confirm applied state. No administrative operations.";
    public static object InputSchema => new { type = "object", properties = new { action = new { type = "string",
        @enum = new[] { "devices", "volume-up", "volume-down", "mute", "unmute" } },
        deviceId = new { type = "string", description = "Registered device UUID from devices; required for media commands." } },
        required = new[] { "action" }, additionalProperties = false };
    public static async Task<string> CallAsync(string directory, JsonElement args, CancellationToken token)
    {
        if (args.ValueKind != JsonValueKind.Object || args.EnumerateObject().Any(p => p.Name is not ("action" or "deviceId")) ||
            !args.TryGetProperty("action", out var value) || value.ValueKind != JsonValueKind.String) throw new ArgumentException("Invalid media tool arguments.");
        string action = value.GetString() ?? "";
        if (action is not ("devices" or "volume-up" or "volume-down" or "mute" or "unmute")) throw new ArgumentException("Action denied.");
        string[] words = [action];
        if (action != "devices")
        {
            if (!args.TryGetProperty("deviceId", out var idValue) || idValue.ValueKind != JsonValueKind.String ||
                !Guid.TryParse(idValue.GetString(), out Guid id)) throw new ArgumentException("Specify the registered device UUID from devices.");
            words = [action, id.ToString()];
        }
        return await LocalControl.CallAsync(directory, words, token);
    }
    public static async Task RunMcpAsync(Options options, CancellationToken token)
    {
        string directory = options.Value("data-dir", StateStore.DefaultDirectory); options.Validate([]);
        using var input = new StreamReader(Console.OpenStandardInput());
        bool initialized = false;
        while (!token.IsCancellationRequested)
        {
            string? line = await CodexRpc.BoundedLineAsync(input, token);
            if (line is null) return;
            using var doc = JsonDocument.Parse(line); var request = doc.RootElement;
            if (!request.TryGetProperty("id", out var id)) continue;
            object response;
            try
            {
                string method = request.GetProperty("method").GetString() ?? "";
                object result;
                if (method == "initialize")
                {
                    initialized = true;
                    result = new { protocolVersion = "2024-11-05", serverInfo = new { name = "flownote-remote", version = "0.5.2" }, capabilities = new { tools = new { } } };
                }
                else if (!initialized) throw new InvalidOperationException("Initialize first.");
                else if (method == "ping") result = new { };
                else if (method == "tools/list") result = new { tools = new[] { new { name = "flownote_remote", description = Description, inputSchema = InputSchema } } };
                else if (method == "tools/call")
                {
                    var parameters = request.GetProperty("params");
                    if (parameters.GetProperty("name").GetString() != "flownote_remote") throw new ArgumentException("Unknown tool.");
                    string text;
                    try { text = await CallAsync(directory, parameters.GetProperty("arguments"), token); }
                    catch (Exception e) when (e is ArgumentException or InvalidOperationException or IOException or System.Net.Sockets.SocketException or TimeoutException or UnauthorizedAccessException)
                    { text = "ERROR: " + e.Message; }
                    result = new { content = new[] { new { type = "text", text } }, isError = text.StartsWith("ERROR:", StringComparison.Ordinal) };
                }
                else throw new ArgumentException("Unknown MCP method.");
                response = new { jsonrpc = "2.0", id = id.Clone(), result };
            }
            catch (Exception e) when (e is ArgumentException or InvalidOperationException or KeyNotFoundException)
            { response = new { jsonrpc = "2.0", id = id.Clone(), error = new { code = -32602, message = "Invalid or unsupported MCP request." } }; }
            Console.WriteLine(JsonSerializer.Serialize(response));
        }
    }
}
