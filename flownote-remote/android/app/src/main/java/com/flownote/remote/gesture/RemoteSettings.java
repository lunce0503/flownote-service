package com.flownote.remote.gesture;

import org.json.JSONException;
import org.json.JSONObject;

final class RemoteSettings {
    static final String[] GESTURES = {"Thumb_Up", "Thumb_Down", "Closed_Fist", "Open_Palm", "Victory", "Pointing_Up", "ILoveYou"};
    static final String[] ACTIONS = {"none", "volume_up", "volume_down", "mute", "assistant_open"};
    static final String[] PRESETS = {"flat", "bass", "treble", "soft", "clear"};
    final JSONObject json;

    RemoteSettings(String text) throws JSONException { json = new JSONObject(text); validate(); }

    void validate() throws JSONException {
        if (json.getInt("schemaVersion") != 1 ||
                !contains(new String[]{"front", "back"}, json.getString("cameraFacing")) ||
                !inRange(json.getDouble("confidenceThreshold"), 0.5, 1) ||
                !inRange(json.getDouble("holdMs"), 100, 2000) ||
                !inRange(json.getDouble("cooldownMs"), 300, 5000) ||
                json.getDouble("holdMs") != json.getInt("holdMs") ||
                json.getDouble("cooldownMs") != json.getInt("cooldownMs") ||
                !inRange(json.getDouble("masterVolume"), 0, 1) ||
                !inRange(json.getDouble("volumeStep"), 0.01, 0.2) ||
                !contains(PRESETS, json.getString("eqPreset")) ||
                json.getBoolean("assistantEnabled") || !json.getBoolean("assistantRequiresConfirmation"))
            throw new JSONException("지원하지 않는 설정");
        json.getBoolean("gesturesEnabled");
        JSONObject bindings = json.getJSONObject("bindings");
        if (bindings.length() != GESTURES.length) throw new JSONException("제스처 수 불일치");
        for (String gesture : GESTURES)
            if (!contains(ACTIONS, bindings.getString(gesture))) throw new JSONException("지원하지 않는 동작");
    }

    static boolean contains(String[] values, String target) {
        for (String value : values) if (value.equals(target)) return true;
        return false;
    }

    private static boolean inRange(double value, double min, double max) {
        return Double.isFinite(value) && value >= min && value <= max;
    }
}
