using System.IO;
using System.Windows;
using System.Windows.Controls;
using Flownote.Remote.Core;

namespace Flownote.Remote.Windows;

public partial class MainWindow : Window
{
    private readonly string settingsPath = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "Flownote", "Remote", "settings.json");
    private readonly Dictionary<string, ComboBox> bindings = [];
    private readonly SoundController sound = new();

    public MainWindow()
    {
        InitializeComponent();
        Facing.ItemsSource = new[] { "front", "back" };
        Preset.ItemsSource = RemoteSettings.Presets;
        TestGesture.ItemsSource = RemoteSettings.Gestures;
        TestGesture.SelectedIndex = 0;
        foreach (var gesture in RemoteSettings.Gestures)
        {
            BindingsPanel.Children.Add(new TextBlock { Text = gesture });
            var select = new ComboBox { ItemsSource = RemoteSettings.Actions };
            System.Windows.Automation.AutomationProperties.SetName(select, gesture + " 동작");
            bindings.Add(gesture, select); BindingsPanel.Children.Add(select);
        }
        foreach (var slider in new[] { Confidence, Hold, Cooldown, Volume }) slider.ValueChanged += (_, _) => UpdateLabels();
        try { ShowSettings(File.Exists(settingsPath) ? RemoteSettings.Parse(File.ReadAllText(settingsPath)) : RemoteSettings.Defaults()); }
        catch (Exception ex) when (ex is IOException or UnauthorizedAccessException or ArgumentException or System.Text.Json.JsonException)
        {
            ShowSettings(RemoteSettings.Defaults());
            Status.Text = "저장된 설정을 읽을 수 없어 기본값을 표시합니다. 기존 파일은 저장 버튼을 누르기 전까지 보존합니다.";
        }
    }

    private void ShowSettings(RemoteSettings s)
    {
        Facing.SelectedItem = s.CameraFacing; Enabled.IsChecked = s.GesturesEnabled;
        Confidence.Value = s.ConfidenceThreshold * 100; Hold.Value = s.HoldMs; Cooldown.Value = s.CooldownMs;
        Volume.Value = s.MasterVolume * 100; Preset.SelectedItem = s.EqPreset;
        foreach (var (gesture, combo) in bindings) combo.SelectedItem = s.Bindings[gesture];
        sound.Apply(s); UpdateLabels();
    }

    private RemoteSettings ReadSettings()
    {
        var s = RemoteSettings.Defaults();
        s.CameraFacing = (string)Facing.SelectedItem; s.GesturesEnabled = Enabled.IsChecked == true;
        s.ConfidenceThreshold = Confidence.Value / 100; s.HoldMs = (int)Hold.Value; s.CooldownMs = (int)Cooldown.Value;
        s.MasterVolume = (float)(Volume.Value / 100); s.EqPreset = (string)Preset.SelectedItem;
        foreach (var (gesture, combo) in bindings) s.Bindings[gesture] = (string)combo.SelectedItem;
        s.Validate(); return s;
    }

    private void UpdateLabels()
    {
        ConfidenceLabel.Text = $"최소 인식 신뢰도: {Confidence.Value:0}%";
        HoldLabel.Text = $"동작 유지 시간: {Hold.Value:0} ms";
        CooldownLabel.Text = $"재실행 간격: {Cooldown.Value:0} ms";
        VolumeLabel.Text = $"음량 설정: {Volume.Value:0}% (실제 출력 준비 중)";
    }

    private void Save_Click(object sender, RoutedEventArgs e)
    {
        try
        {
            var s = ReadSettings(); Directory.CreateDirectory(Path.GetDirectoryName(settingsPath)!);
            File.WriteAllText(settingsPath + ".tmp", s.ToJson()); File.Move(settingsPath + ".tmp", settingsPath, true);
            sound.Apply(s); Status.Text = "설정을 저장했습니다. 실제 장치 동작은 실행하지 않았습니다.";
        }
        catch (Exception ex) when (ex is IOException or UnauthorizedAccessException or ArgumentException)
        { Status.Text = "설정을 저장하지 못했습니다. 저장 공간과 설정값을 확인하세요."; }
    }

    private void Reset_Click(object sender, RoutedEventArgs e)
    { ShowSettings(RemoteSettings.Defaults()); Status.Text = "기본값을 표시합니다. 저장 버튼을 눌러 적용하세요."; }

    private void Test_Click(object sender, RoutedEventArgs e)
    {
        var s = ReadSettings(); var gate = new GestureGate(); string? result = null;
        for (long time = 0; time <= s.HoldMs; time += 100)
            result ??= gate.Observe(s, (string)TestGesture.SelectedItem, 1, time);
        Status.Text = result is null ? "실행 후보 없음: 제스처 사용 설정과 동작 연결을 확인하세요."
            : $"테스트 후보: {result} · 실제 소리·비서 동작은 실행하지 않습니다.";
    }
}
