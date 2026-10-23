namespace Flownote.Remote.Core;

// Detector adapters feed monotonic milliseconds, including no-hand/low-confidence samples.
// A held gesture fires once; release is required before the same gesture can fire again.
public sealed class GestureGate
{
    private string? candidate;
    private long since, lastSample = -1, lastAction = -1;
    private bool fired;

    public void Reset()
    {
        candidate = null; fired = false; since = 0; lastSample = -1; lastAction = -1;
    }

    public string? Observe(RemoteSettings settings, string? gesture, double confidence, long timestampMs)
    {
        settings.Validate();
        if (timestampMs < 0 || timestampMs < lastSample) { Reset(); return null; }
        bool gap = lastSample >= 0 && timestampMs - lastSample > 250;
        lastSample = timestampMs;
        if (!settings.GesturesEnabled || !double.IsFinite(confidence) || confidence < settings.ConfidenceThreshold ||
            confidence > 1 || gesture is null || !settings.Bindings.TryGetValue(gesture, out var action) || action == "none")
        {
            candidate = null; fired = false; return null;
        }
        if (gap || candidate != gesture) { candidate = gesture; since = timestampMs; fired = false; }
        if (fired || timestampMs - since < settings.HoldMs ||
            (lastAction >= 0 && timestampMs - lastAction < settings.CooldownMs)) return null;
        fired = true; lastAction = timestampMs;
        return action;
    }
}
