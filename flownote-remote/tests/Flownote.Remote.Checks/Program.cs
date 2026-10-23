using Flownote.Remote.Core;

static void Check(bool condition, string message)
{
    if (!condition) throw new InvalidOperationException(message);
}
static void Reject(Action action)
{
    try { action(); } catch (ArgumentException) { return; }
    throw new InvalidOperationException("Invalid settings accepted");
}
static string? Feed(GestureGate gate, RemoteSettings settings, string gesture, long start, long end)
{
    string? result = null;
    for (long time = start; time <= end; time += 100)
    { var action = gate.Observe(settings, gesture, 1, time); if (action is not null) result = action; }
    return result;
}

var settings = RemoteSettings.Defaults();
Check(!settings.GesturesEnabled && !settings.AssistantEnabled && settings.AssistantRequiresConfirmation, "Unsafe defaults");
Check(RemoteSettings.Parse(settings.ToJson()).Bindings["Victory"] == "assistant_open", "Settings round trip");
var gate = new GestureGate();
Check(Feed(gate, settings, "Thumb_Up", 0, 500) is null, "Disabled gesture fired");
settings.GesturesEnabled = true; gate.Reset();
Check(Feed(gate, settings, "Thumb_Up", 0, 300) is null, "Gesture fired before hold");
Check(gate.Observe(settings, "Thumb_Up", 1, 400) == "volume_up", "Held gesture missing");
Check(Feed(gate, settings, "Thumb_Up", 500, 2000) is null, "Held gesture repeated");
gate.Observe(settings, null, 0, 2100);
Check(Feed(gate, settings, "Thumb_Up", 2200, 2600) == "volume_up", "Release did not rearm");
gate.Observe(settings, null, 0, 2700);
Check(Feed(gate, settings, "Closed_Fist", 2800, 3200) is null, "Cooldown ignored");
Check(Feed(gate, settings, "Closed_Fist", 3300, 3800) == "mute", "Cooldown did not expire");
gate.Reset();
Check(gate.Observe(settings, "Thumb_Up", 1, 0) is null, "Initial observation fired");
Check(gate.Observe(settings, "Thumb_Up", 1, 500) is null, "Stale frames satisfied hold");
Check(Feed(gate, settings, "Thumb_Up", 600, 900) == "volume_up", "Fresh frames missing");
Check(gate.Observe(settings, "Thumb_Up", 1, 800) is null, "Time reversal accepted");
gate.Reset();
Check(Feed(gate, settings, "Thumb_Down", 0, 200) is null, "Hold too short");
gate.Observe(settings, "Thumb_Down", 0.1, 300);
Check(Feed(gate, settings, "Thumb_Down", 400, 700) is null, "Low confidence did not reset hold");
Check(gate.Observe(settings, "Thumb_Down", 1, 800) == "volume_down", "Confidence recovery missing");
gate.Reset();
foreach (var score in new[] { double.NaN, double.PositiveInfinity, 1.1 })
    Check(gate.Observe(settings, "Thumb_Up", score, 0) is null, "Invalid score accepted");
Check(Feed(gate, settings, "unknown", 100, 600) is null, "Unknown gesture accepted");
settings.ConfidenceThreshold = double.NaN; Reject(settings.Validate); settings.ConfidenceThreshold = 0.8;
settings.Bindings["Thumb_Up"] = "shell_execute"; Reject(settings.Validate); settings.Bindings["Thumb_Up"] = "volume_up";
settings.AssistantEnabled = true; Reject(settings.Validate); settings.AssistantEnabled = false;
settings.MasterVolume = 2; Reject(settings.Validate); settings.MasterVolume = 0.6f;
settings.EqPreset = "bass";
var sound = new SoundController(); sound.Apply(settings);
Check(sound.Mixer.Settings.MasterVolume == 0.6f && sound.Mixer.Settings.BassDb == 6, "Sound Manager integration failed");
var samples = new float[960]; sound.Mixer.Render(samples);
Check(samples.All(x => x == 0), "Empty mixer produced audio");
Console.WriteLine("PASS: settings, gesture confidence/hold/release/cooldown/gaps and Sound Manager integration");
