package com.flownote.remote.gesture;

import org.json.JSONException;

// Feed monotonic elapsedRealtime milliseconds; send a null gesture on hand loss.
final class GestureGate {
    private String candidate;
    private long since, lastSample = -1, lastAction = -1;
    private boolean fired;

    void reset() { candidate = null; fired = false; since = 0; lastSample = -1; lastAction = -1; }

    String observe(RemoteSettings settings, String gesture, double confidence, long time) throws JSONException {
        settings.validate();
        if (time < 0 || time < lastSample) { reset(); return null; }
        boolean gap = lastSample >= 0 && time - lastSample > 250;
        lastSample = time;
        String action = gesture == null ? "none" : settings.json.getJSONObject("bindings").optString(gesture, "none");
        if (!settings.json.getBoolean("gesturesEnabled") || !Double.isFinite(confidence) ||
                confidence < settings.json.getDouble("confidenceThreshold") || confidence > 1 || action.equals("none")) {
            candidate = null; fired = false; return null;
        }
        if (gap || !gesture.equals(candidate)) { candidate = gesture; since = time; fired = false; }
        if (fired || time - since < settings.json.getInt("holdMs") ||
                (lastAction >= 0 && time - lastAction < settings.json.getInt("cooldownMs"))) return null;
        fired = true; lastAction = time;
        return action;
    }
}
