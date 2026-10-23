using System.Text.Json;

namespace Flownote.Remote.Core;

public sealed class RemoteSettings
{
    public static readonly string[] Gestures = ["Thumb_Up", "Thumb_Down", "Closed_Fist", "Open_Palm", "Victory", "Pointing_Up", "ILoveYou"];
    public static readonly string[] Actions = ["none", "volume_up", "volume_down", "mute", "assistant_open"];
    public static readonly string[] Presets = ["flat", "bass", "treble", "soft", "clear"];
    private static readonly JsonSerializerOptions JsonOptions = new(JsonSerializerDefaults.Web) { WriteIndented = true };

    public int SchemaVersion { get; set; } = 1;
    public string CameraFacing { get; set; } = "front";
    public bool GesturesEnabled { get; set; }
    public double ConfidenceThreshold { get; set; } = 0.8;
    public int HoldMs { get; set; } = 400;
    public int CooldownMs { get; set; } = 1200;
    public float MasterVolume { get; set; } = 0.7f;
    public float VolumeStep { get; set; } = 0.05f;
    public string EqPreset { get; set; } = "flat";
    public bool AssistantEnabled { get; set; }
    public bool AssistantRequiresConfirmation { get; set; } = true;
    public Dictionary<string, string> Bindings { get; set; } = [];

    public void Validate()
    {
        if (SchemaVersion != 1 || CameraFacing is not ("front" or "back") ||
            !double.IsFinite(ConfidenceThreshold) || ConfidenceThreshold is < 0.5 or > 1 ||
            HoldMs is < 100 or > 2000 || CooldownMs is < 300 or > 5000 ||
            !float.IsFinite(MasterVolume) || MasterVolume is < 0 or > 1 ||
            !float.IsFinite(VolumeStep) || VolumeStep is < 0.01f or > 0.2f ||
            !Presets.Contains(EqPreset) || AssistantEnabled || !AssistantRequiresConfirmation ||
            Bindings is null || Bindings.Count != Gestures.Length ||
            Gestures.Any(g => !Bindings.TryGetValue(g, out var a) || !Actions.Contains(a)))
            throw new ArgumentException("지원하지 않는 설정입니다. 기본값을 복원하거나 범위를 확인하세요.");
    }

    public static RemoteSettings Defaults()
    {
        using var stream = typeof(RemoteSettings).Assembly.GetManifestResourceStream("default-settings.json")!;
        return Parse(new StreamReader(stream).ReadToEnd());
    }

    public static RemoteSettings Parse(string json)
    {
        var settings = JsonSerializer.Deserialize<RemoteSettings>(json, JsonOptions)
            ?? throw new ArgumentException("설정이 비어 있습니다.");
        settings.Validate();
        return settings;
    }

    public string ToJson() { Validate(); return JsonSerializer.Serialize(this, JsonOptions); }
}
