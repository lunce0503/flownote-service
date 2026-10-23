package com.flownote.remote.gesture;

import org.junit.Test;
import org.json.JSONException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.charset.StandardCharsets;
import static org.junit.Assert.*;

public class GestureGateTest {
    private RemoteSettings settings() throws Exception {
        return new RemoteSettings(new String(Files.readAllBytes(Path.of("../../config/default-settings.json")), StandardCharsets.UTF_8));
    }
    private String feed(GestureGate gate, RemoteSettings settings, String gesture, long start, long end) throws Exception {
        String result = null;
        for (long time = start; time <= end; time += 100) {
            String next = gate.observe(settings, gesture, 1, time);
            if (next != null) result = next;
        }
        return result;
    }
    @Test public void disabledByDefaultAndRoundTrip() throws Exception {
        var s = settings();
        assertFalse(s.json.getBoolean("gesturesEnabled"));
        assertFalse(s.json.getBoolean("assistantEnabled"));
        assertTrue(s.json.getBoolean("assistantRequiresConfirmation"));
        assertNull(feed(new GestureGate(), s, "Thumb_Up", 0, 500));
        assertEquals("assistant_open", new RemoteSettings(s.json.toString()).json.getJSONObject("bindings").getString("Victory"));
    }
    @Test public void holdReleaseAndCooldown() throws Exception {
        var s = settings(); s.json.put("gesturesEnabled", true); var gate = new GestureGate();
        assertNull(feed(gate, s, "Thumb_Up", 0, 300));
        assertEquals("volume_up", gate.observe(s, "Thumb_Up", 1, 400));
        assertNull(feed(gate, s, "Thumb_Up", 500, 2000));
        gate.observe(s, null, 0, 2100);
        assertEquals("volume_up", feed(gate, s, "Thumb_Up", 2200, 2600));
        gate.observe(s, null, 0, 2700);
        assertNull(feed(gate, s, "Closed_Fist", 2800, 3200));
        assertEquals("mute", feed(gate, s, "Closed_Fist", 3300, 3800));
    }
    @Test public void staleFramesAndLowConfidenceResetHold() throws Exception {
        var s = settings(); s.json.put("gesturesEnabled", true); var gate = new GestureGate();
        assertNull(gate.observe(s, "Thumb_Up", 1, 0));
        assertNull(gate.observe(s, "Thumb_Up", 1, 500));
        assertEquals("volume_up", feed(gate, s, "Thumb_Up", 600, 900));
        assertNull(gate.observe(s, "Thumb_Up", 1, 800));
        gate.reset();
        assertNull(feed(gate, s, "Thumb_Down", 0, 200));
        gate.observe(s, "Thumb_Down", 0.1, 300);
        assertNull(feed(gate, s, "Thumb_Down", 400, 700));
        assertEquals("volume_down", gate.observe(s, "Thumb_Down", 1, 800));
    }
    @Test public void invalidScoresAndUnknownGesturesAreIgnored() throws Exception {
        var s = settings(); s.json.put("gesturesEnabled", true); var gate = new GestureGate();
        for (double score : new double[]{Double.NaN, Double.POSITIVE_INFINITY, 1.1})
            assertNull(gate.observe(s, "Thumb_Up", score, 0));
        assertNull(feed(gate, s, "unknown", 100, 600));
    }
    @Test public void unsafeSettingsAreRejected() throws Exception {
        var s = settings(); s.json.put("assistantEnabled", true);
        assertThrows(JSONException.class, s::validate);
        s = settings(); s.json.getJSONObject("bindings").put("Thumb_Up", "shell_execute");
        assertThrows(JSONException.class, s::validate);
        s = settings(); s.json.put("masterVolume", 2); assertThrows(JSONException.class, s::validate);
        s = settings(); s.json.put("holdMs", 100.5); assertThrows(JSONException.class, s::validate);
    }
}
