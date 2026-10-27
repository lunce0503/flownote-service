using System.Net;
using System.Net.Security;
using System.Security.Cryptography;
using System.Security.Cryptography.X509Certificates;
using System.Text.Json;

namespace Flownote.Remote.Network;

public sealed record DeviceGrant(Guid Id, string Name, string TokenHash, bool Allowed = true);
public sealed record PairRequest(string Code, string Name);
public sealed record PairResult(Guid DeviceId, string Token);
public sealed record GestureSample(string? Gesture, double Confidence);
public sealed record DeviceState(Guid Id, string Name, bool Connected, bool CameraActive, float Volume, bool Muted, int? BatteryPercent, long LastSeenMs,
    bool Enabled = true, bool Allowed = true, bool OutputReady = true, bool SpeakAlerts = true, string Platform = "클라이언트",
    bool InterfaceReady = false, double Zoom = 1, double PanX = 0, double PanY = 0, bool PointerReady = false);
public sealed record HubCapabilities(bool CameraFrames = false, bool GestureRecognition = true, bool OutputVolume = true,
    bool HealthVoiceAlerts = true, bool AudioTransport = false, bool AudioSeparation = false, bool ScreenLayout = false,
    bool ProjectorOutput = false, bool ConversationalAssistant = false, bool ClientParticipation = false,
    bool SkeletonFrames = false, bool ScopedGestures = false, bool InterfaceControl = false, bool TouchInput = false);
public sealed record RemoteTask(Guid Id, string Name, string Kind = "codex.voice");
public sealed record HubState(DeviceState[] Devices, Guid? GestureTarget, Guid? VoiceTarget, bool GesturesEnabled, HubCapabilities? Capabilities = null,
    RemoteTask[]? Tasks = null, Guid? SelectedTask = null, double DetectionThreshold = .8);
public sealed record InterfaceCommand(Guid CommandId, string Scope, string Action, double Value = 0, double X = 0, double Y = 0, Guid? TaskId = null)
{
    public void Validate()
    {
        if (CommandId == Guid.Empty || Scope is not ("all" or "management" or "precision") ||
            !double.IsFinite(Value) || !double.IsFinite(X) || !double.IsFinite(Y)) throw new ArgumentException("Invalid interface command.");
        bool valid = Action switch
        {
            "interface.minimize" or "interface.restore" or "interface.details" or "interface.reset" => true,
            "task.focus" => TaskId.HasValue && TaskId != Guid.Empty,
            "interface.zoom" => Value is >= .88 and <= 1.12,
            "interface.zoom_set" => Value is >= .5 and <= 2,
            "interface.pan" => X is >= -.08 and <= .08 && Y is >= -.08 and <= .08,
            "interface.pan_set" => X is >= -1 and <= 1 && Y is >= -1 and <= 1,
            "pointer.move" => Value == 0 && Math.Abs(X) <= 128 && Math.Abs(Y) <= 128,
            "pointer.scroll" => X == 0 && Y == 0 && Value is >= -3 and <= 3,
            "pointer.click" or "pointer.right_click" or "pointer.down" or "pointer.up" or "pointer.hold" => Value == 0 && X == 0 && Y == 0,
            _ => false
        };
        if (!valid) throw new ArgumentException("Unsupported interface command.");
    }
}
public sealed record InterfaceResult(bool Applied, double Zoom = 1, double PanX = 0, double PanY = 0, string? Error = null);
public sealed record OutputCommand(Guid CommandId, float Volume, bool Muted, bool StepIfUnchanged = true);
public sealed record OutputResult(bool Applied, float Volume, bool Muted, string? Error = null);
public sealed record AlertNotice(Guid Id, string Code, string Severity, string Message, string English, bool Speak);
public sealed record HealthSample(float Volume, bool Muted, int? BatteryPercent = null, bool OutputReady = true, int? MemoryLoadPercent = null,
    bool SpeakAlerts = true, string Platform = "클라이언트", bool InterfaceReady = false, bool PointerReady = false);

public static class Protocol
{
    public const int Port = 17843;
    public const int MaxMessageBytes = 262144;
    public const int MaxFrameBytes = 131072;
    public static readonly JsonSerializerOptions Json = new(JsonSerializerDefaults.Web) { MaxDepth = 12 };
    public static string Hash(string value) => Convert.ToHexString(SHA256.HashData(System.Text.Encoding.UTF8.GetBytes(value)));
    public static string Pin(X509Certificate2 certificate) => Convert.ToHexString(SHA256.HashData(certificate.RawData));
    public static string NormalizePin(string pin) => pin.Replace(":", "", StringComparison.Ordinal).Trim().ToUpperInvariant();

    public static Uri ServerUri(string address)
    {
        if (!Uri.TryCreate(address, UriKind.Absolute, out var uri) || uri.Scheme != "https" ||
            uri.UserInfo.Length != 0 || uri.AbsolutePath != "/" || uri.Query.Length != 0 || uri.Fragment.Length != 0 ||
            !IPAddress.TryParse(uri.Host, out var ip) || ip.GetAddressBytes().Length != 4 || !IsPrivate(ip) || uri.Port == 0)
            throw new ArgumentException("서버의 사설/VPN IPv4 HTTPS 주소를 입력하세요. 예: https://192.168.0.10:17843");
        return uri;
    }

    public static bool IsPrivate(IPAddress address)
    {
        byte[] b = address.GetAddressBytes();
        return IPAddress.IsLoopback(address) || b.Length == 4 &&
            (b[0] == 10 || b[0] == 192 && b[1] == 168 || b[0] == 172 && b[1] is >= 16 and <= 31 || b[0] == 100 && b[1] is >= 64 and <= 127);
    }

    public static bool Trust(X509Certificate? certificate, string expectedPin, SslPolicyErrors errors)
    {
        if (certificate is null || (errors & SslPolicyErrors.RemoteCertificateNameMismatch) != 0) return false;
        using var cert = new X509Certificate2(certificate);
        string pin = NormalizePin(expectedPin);
        return pin.Length == 64 && pin.All(Uri.IsHexDigit) && DateTime.UtcNow >= cert.NotBefore.ToUniversalTime() &&
            DateTime.UtcNow <= cert.NotAfter.ToUniversalTime() &&
            CryptographicOperations.FixedTimeEquals(System.Text.Encoding.ASCII.GetBytes(Pin(cert)), System.Text.Encoding.ASCII.GetBytes(pin));
    }

    public static X509Certificate2 CreateCertificate(params IPAddress[] addresses)
    {
        using var rsa = RSA.Create(3072);
        var request = new CertificateRequest("CN=Flownote Remote", rsa, HashAlgorithmName.SHA256, RSASignaturePadding.Pkcs1);
        var san = new SubjectAlternativeNameBuilder();
        foreach (var address in addresses.Distinct()) san.AddIpAddress(address);
        request.CertificateExtensions.Add(san.Build());
        request.CertificateExtensions.Add(new X509BasicConstraintsExtension(false, false, 0, true));
        request.CertificateExtensions.Add(new X509KeyUsageExtension(X509KeyUsageFlags.DigitalSignature | X509KeyUsageFlags.KeyEncipherment, true));
        using var generated = request.CreateSelfSigned(DateTimeOffset.UtcNow.AddMinutes(-5), DateTimeOffset.UtcNow.AddYears(2));
        return X509CertificateLoader.LoadPkcs12(generated.Export(X509ContentType.Pfx), null,
            X509KeyStorageFlags.Exportable);
    }

    public static void ValidateJpeg(byte[] jpeg)
    {
        if (jpeg.Length is < 4 or > MaxFrameBytes || jpeg[0] != 255 || jpeg[1] != 216) throw new ArgumentException("JPEG 프레임이 필요합니다.");
        int i = 2;
        while (i + 3 < jpeg.Length)
        {
            if (jpeg[i++] != 255) throw new ArgumentException("JPEG 마커 오류");
            while (i < jpeg.Length && jpeg[i] == 255) i++;
            if (i >= jpeg.Length) break;
            int marker = jpeg[i++];
            if (marker is 216 or 217 or >= 208 and <= 215) continue;
            if (i + 2 > jpeg.Length) break;
            int length = jpeg[i] * 256 + jpeg[i + 1];
            if (length < 2 || i + length > jpeg.Length) break;
            if (marker is 192 or 193 or 194)
            {
                if (length < 8) break;
                int height = jpeg[i + 3] * 256 + jpeg[i + 4], width = jpeg[i + 5] * 256 + jpeg[i + 6];
                if (width is > 0 and <= 640 && height is > 0 and <= 640 && width * height <= 307200) return;
                throw new ArgumentException("프레임은 최대 640×480 또는 480×640입니다.");
            }
            i += length;
        }
        throw new ArgumentException("JPEG 크기를 확인할 수 없습니다.");
    }
}
