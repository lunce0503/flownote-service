package com.flownote.remote.gesture;

import android.app.Activity;
import android.content.SharedPreferences;
import android.graphics.Color;
import android.os.Bundle;
import android.os.Build;
import android.view.View;
import android.view.WindowInsets;
import android.widget.*;
import org.json.JSONException;
import java.io.IOException;
import java.io.InputStream;
import java.io.ByteArrayOutputStream;
import java.nio.charset.StandardCharsets;
import java.util.Locale;
import java.util.LinkedHashMap;
import java.util.Map;

public final class MainActivity extends Activity {
    private LinearLayout content;
    private SharedPreferences preferences;
    private String defaults;
    private Switch enabled;
    private Spinner facing, preset, testGesture;
    private SeekBar confidence, hold, cooldown, volume;
    private TextView status;
    private final Map<String, Spinner> bindings = new LinkedHashMap<>();

    @Override public void onCreate(Bundle state) {
        super.onCreate(state);
        preferences = getSharedPreferences("remote-settings-v1", MODE_PRIVATE);
        ScrollView scroll = new ScrollView(this);
        content = new LinearLayout(this); content.setOrientation(LinearLayout.VERTICAL);
        int padding = dp(24); content.setPadding(padding, padding, padding, padding);
        content.setBackgroundColor(Color.rgb(246, 243, 235));
        scroll.addView(content); setContentView(scroll);
        scroll.setOnApplyWindowInsetsListener((view, insets) -> {
            if (Build.VERSION.SDK_INT >= 30) {
                var bars = insets.getInsets(WindowInsets.Type.systemBars() | WindowInsets.Type.displayCutout());
                view.setPadding(bars.left, bars.top, bars.right, bars.bottom);
            } else {
                view.setPadding(insets.getSystemWindowInsetLeft(), insets.getSystemWindowInsetTop(),
                        insets.getSystemWindowInsetRight(), insets.getSystemWindowInsetBottom());
            }
            return insets;
        });
        label("Flownote Remote").setTextSize(28);
        label("Android · 소리와 제스처 설정");
        label("설정 미리보기 단계입니다. 카메라 인식·실제 소리 제어·비서 실행은 아직 연결되지 않았습니다.");
        facing = spinner("카메라 방향 (인식 연결 시 사용)", new String[]{"front", "back"});
        enabled = new Switch(this); enabled.setText("제스처 사용 설정 (현재 테스트 입력만 사용)"); content.addView(enabled);
        confidence = slider("최소 인식 신뢰도 (%)", 50, 100, 1);
        hold = slider("동작 유지 시간 (ms)", 100, 2000, 100);
        cooldown = slider("재실행 간격 (ms)", 300, 5000, 100);
        label("제스처별 동작").setTextSize(20);
        for (String gesture : RemoteSettings.GESTURES) bindings.put(gesture, spinner(gesture, RemoteSettings.ACTIONS));
        volume = slider("음량 설정 (%) · 실제 출력 준비 중", 0, 100, 1);
        preset = spinner("EQ 프리셋", RemoteSettings.PRESETS);
        label("비서: 연결 준비 중 · 실행 전 확인 필수");
        button("설정 저장", this::save);
        button("기본값 복원", () -> {
            try { show(new RemoteSettings(defaults)); status.setText("기본값을 표시합니다. 저장 버튼을 눌러 적용하세요."); }
            catch (JSONException ex) { status.setText("기본 설정을 읽지 못했습니다."); }
        });
        testGesture = spinner("테스트할 제스처", RemoteSettings.GESTURES);
        button("제스처 유지 테스트 (동작 이름만 확인)", this::test);
        status = label("카메라 사용과 원격 연결은 아직 시작하지 않습니다.");
        status.setAccessibilityLiveRegion(View.ACCESSIBILITY_LIVE_REGION_POLITE);
        try (InputStream input = getAssets().open("default-settings.json")) {
            ByteArrayOutputStream bytes = new ByteArrayOutputStream(); byte[] buffer = new byte[4096]; int count;
            while ((count = input.read(buffer)) != -1) bytes.write(buffer, 0, count);
            defaults = bytes.toString(StandardCharsets.UTF_8.name());
            String draft = state == null ? null : state.getString("draft");
            try { show(new RemoteSettings(draft == null ? preferences.getString("settings", defaults) : draft)); }
            catch (JSONException ex) {
                show(new RemoteSettings(defaults));
                status.setText("저장된 설정을 읽을 수 없어 기본값을 표시합니다. 저장 전까지 기존 설정을 보존합니다.");
            }
        } catch (IOException | JSONException ex) { status.setText("기본 설정을 읽지 못했습니다. 앱을 다시 설치해 주세요."); }
    }

    @Override protected void onSaveInstanceState(Bundle state) {
        try { if (defaults != null) state.putString("draft", read().json.toString()); }
        catch (JSONException ex) { /* Preserve the last saved settings if the draft is invalid. */ }
        super.onSaveInstanceState(state);
    }

    private int dp(int value) { return Math.round(value * getResources().getDisplayMetrics().density); }
    private TextView label(String text) {
        TextView view = new TextView(this); view.setText(text); view.setTextSize(16);
        view.setTextColor(Color.rgb(32, 32, 32)); view.setPadding(0, dp(10), 0, dp(6));
        content.addView(view); return view;
    }
    private Spinner spinner(String title, String[] choices) {
        TextView text = label(title); Spinner view = new Spinner(this);
        view.setId(View.generateViewId()); text.setLabelFor(view.getId()); view.setContentDescription(title);
        view.setMinimumHeight(dp(48));
        ArrayAdapter<String> adapter = new ArrayAdapter<>(this, android.R.layout.simple_spinner_item, choices);
        adapter.setDropDownViewResource(android.R.layout.simple_spinner_dropdown_item);
        view.setAdapter(adapter); content.addView(view); return view;
    }
    private SeekBar slider(String title, int min, int max, int step) {
        TextView text = label(title); SeekBar view = new SeekBar(this); view.setMax((max - min) / step);
        view.setId(View.generateViewId()); text.setLabelFor(view.getId()); view.setMinimumHeight(dp(48));
        view.setTag(new int[]{min, step});
        view.setOnSeekBarChangeListener(new SeekBar.OnSeekBarChangeListener() {
            public void onProgressChanged(SeekBar bar, int progress, boolean fromUser) {
                text.setText(String.format(Locale.getDefault(), "%s: %d", title, value(bar)));
                bar.setContentDescription(text.getText());
            }
            public void onStartTrackingTouch(SeekBar bar) { }
            public void onStopTrackingTouch(SeekBar bar) { }
        });
        content.addView(view); return view;
    }
    private int value(SeekBar view) { int[] range = (int[])view.getTag(); return range[0] + view.getProgress() * range[1]; }
    private void setValue(SeekBar view, int value) {
        int[] range = (int[])view.getTag(); view.setProgress((value - range[0]) / range[1]);
    }
    private void select(Spinner view, String value) {
        for (int i = 0; i < view.getCount(); i++) if (view.getItemAtPosition(i).equals(value)) { view.setSelection(i); return; }
    }
    private void button(String title, Runnable action) {
        Button button = new Button(this); button.setText(title); button.setAllCaps(false);
        button.setOnClickListener(view -> action.run()); content.addView(button);
    }
    private void show(RemoteSettings settings) throws JSONException {
        var json = settings.json;
        select(facing, json.getString("cameraFacing")); enabled.setChecked(json.getBoolean("gesturesEnabled"));
        setValue(confidence, (int)Math.round(json.getDouble("confidenceThreshold") * 100));
        setValue(hold, json.getInt("holdMs")); setValue(cooldown, json.getInt("cooldownMs"));
        setValue(volume, (int)Math.round(json.getDouble("masterVolume") * 100)); select(preset, json.getString("eqPreset"));
        for (var entry : bindings.entrySet()) select(entry.getValue(), json.getJSONObject("bindings").getString(entry.getKey()));
    }
    private RemoteSettings read() throws JSONException {
        var settings = new RemoteSettings(defaults); var json = settings.json;
        json.put("cameraFacing", facing.getSelectedItem()); json.put("gesturesEnabled", enabled.isChecked());
        json.put("confidenceThreshold", value(confidence) / 100.0); json.put("holdMs", value(hold));
        json.put("cooldownMs", value(cooldown)); json.put("masterVolume", value(volume) / 100.0);
        json.put("eqPreset", preset.getSelectedItem());
        for (var entry : bindings.entrySet()) json.getJSONObject("bindings").put(entry.getKey(), entry.getValue().getSelectedItem());
        settings.validate(); return settings;
    }
    private void save() {
        try {
            boolean saved = preferences.edit().putString("settings", read().json.toString()).commit();
            status.setText(saved ? "설정을 저장했습니다. 실제 장치 동작은 실행하지 않았습니다." : "설정을 저장하지 못했습니다. 저장 공간을 확인하세요.");
        } catch (JSONException ex) { status.setText("설정을 저장하지 못했습니다. 설정값을 확인하세요."); }
    }
    private void test() {
        try {
            var settings = read(); var gate = new GestureGate(); String result = null;
            for (long time = 0; time <= settings.json.getInt("holdMs"); time += 100) {
                String next = gate.observe(settings, (String)testGesture.getSelectedItem(), 1, time);
                if (next != null) result = next;
            }
            status.setText(result == null ? "실행 후보 없음: 제스처 사용 설정과 동작 연결을 확인하세요."
                    : "테스트 후보: " + result + " · 실제 소리·비서 동작은 실행하지 않습니다.");
        } catch (JSONException ex) { status.setText("테스트할 설정을 읽지 못했습니다."); }
    }
}
