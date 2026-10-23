namespace Flownote.Remote.Network;

// A short-lived invitation, never a persistent device token. Parsing never opens a connection.
public sealed record PairingLink(string Address, string Pin, string Code, long Expires)
{
    public string Encode()
    {
        string text = $"flownote-remote://pair?v=1&address={Uri.EscapeDataString(Address)}&pin={Uri.EscapeDataString(Pin)}&code={Code}&expires={Expires}";
        _ = Parse(text);
        return text;
    }
    public static PairingLink Parse(string text)
    {
        const string invalid = "올바른 Flownote 연결 QR 또는 연결 코드를 사용하세요.";
        if (text.Length > 1024 || !Uri.TryCreate(text.Trim(), UriKind.Absolute, out var uri) || uri.Scheme != "flownote-remote" ||
            uri.Host != "pair" || uri.Port != -1 || uri.UserInfo.Length != 0 || uri.Fragment.Length != 0 || uri.AbsolutePath is not ("" or "/"))
            throw new ArgumentException(invalid);
        var query = new Dictionary<string, string>(StringComparer.Ordinal);
        foreach (string part in uri.Query.TrimStart('?').Split('&'))
        {
            var pair = part.Split('=', 2);
            if (pair.Length != 2 || !query.TryAdd(Uri.UnescapeDataString(pair[0]), Uri.UnescapeDataString(pair[1]))) throw new ArgumentException(invalid);
        }
        if (query.Count != 5 || !query.TryGetValue("v", out var version) || version != "1" ||
            !query.TryGetValue("address", out var address) || !query.TryGetValue("pin", out var pin) ||
            !query.TryGetValue("code", out var code) || code.Length != 6 || !code.All(c => c is >= '0' and <= '9') ||
            !query.TryGetValue("expires", out var rawExpiry) || !long.TryParse(rawExpiry, out var expiry)) throw new ArgumentException(invalid);
        long now = DateTimeOffset.UtcNow.ToUnixTimeSeconds();
        if (expiry <= now || expiry > now + 150) throw new ArgumentException("연결 QR이 만료됐거나 기기 시간이 다릅니다. 서버에서 새 QR을 만드세요.");
        pin = Protocol.NormalizePin(pin);
        if (pin.Length != 64 || !pin.All(Uri.IsHexDigit)) throw new ArgumentException(invalid);
        return new(Protocol.ServerUri(address).ToString(), pin, code, expiry);
    }
}
