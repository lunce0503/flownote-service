using System.Runtime.InteropServices;
using System.Speech.Synthesis;
using NAudio.CoreAudioApi;
using Flownote.Remote.Network;

namespace Flownote.Remote.Windows;

public static class NativeOutput
{
    [StructLayout(LayoutKind.Sequential)]
    private struct MemoryStatus
    {
        public uint Length, Load;
        public ulong TotalPhysical, AvailablePhysical, TotalPage, AvailablePage, TotalVirtual, AvailableVirtual, AvailableExtended;
    }
    [DllImport("kernel32.dll", SetLastError = true)]
    [return: MarshalAs(UnmanagedType.Bool)]
    private static extern bool GlobalMemoryStatusEx(ref MemoryStatus status);
    private static int? MemoryLoad()
    { var status = new MemoryStatus { Length = (uint)Marshal.SizeOf<MemoryStatus>() }; return GlobalMemoryStatusEx(ref status) ? (int)status.Load : null; }
    public static HealthSample Health()
    {
        try
        {
            using var enumerator = new MMDeviceEnumerator();
            using var device = enumerator.GetDefaultAudioEndpoint(DataFlow.Render, Role.Multimedia);
            return new(device.AudioEndpointVolume.MasterVolumeLevelScalar, device.AudioEndpointVolume.Mute, MemoryLoadPercent: MemoryLoad());
        }
        catch (Exception e) when (e is COMException or InvalidOperationException)
        { return new(0, false, OutputReady: false, MemoryLoadPercent: MemoryLoad()); }
    }
    public static Task<OutputResult> ApplyAsync(OutputCommand command)
    {
        try
        {
            using var enumerator = new MMDeviceEnumerator();
            using var device = enumerator.GetDefaultAudioEndpoint(DataFlow.Render, Role.Multimedia);
            device.AudioEndpointVolume.MasterVolumeLevelScalar = Math.Clamp(command.Volume, 0, 1);
            device.AudioEndpointVolume.Mute = command.Muted;
            return Task.FromResult(new OutputResult(true, device.AudioEndpointVolume.MasterVolumeLevelScalar, device.AudioEndpointVolume.Mute));
        }
        catch (Exception e) when (e is COMException or InvalidOperationException)
        { return Task.FromResult(new OutputResult(false, 0, false, "output_unavailable")); }
    }
}

public sealed class AssistantVoice : IDisposable
{
    private SpeechSynthesizer? speaker;
    private bool korean;
    public bool Enabled { get; set; } = true;
    public event Action<string>? Activity;
    public void Speak(AlertNotice notice)
    {
        Activity?.Invoke(notice.Message);
        if (!Enabled || !notice.Speak) return;
        try
        {
            var health = NativeOutput.Health();
            if (!health.OutputReady || health.Muted) { Activity?.Invoke("음성 출력 불가: 출력 장치·음소거를 확인하세요. 화면 알림은 유지합니다."); return; }
            if (speaker is null)
            {
                speaker = new SpeechSynthesizer();
                var voices = speaker.GetInstalledVoices().Where(v => v.Enabled).ToArray();
                var selected = voices.FirstOrDefault(v => v.VoiceInfo.Culture.TwoLetterISOLanguageName == "ko") ?? voices.FirstOrDefault();
                if (selected is null) throw new InvalidOperationException("음성 엔진 없음");
                korean = selected.VoiceInfo.Culture.TwoLetterISOLanguageName == "ko";
                speaker.SelectVoice(selected.VoiceInfo.Name);
                speaker.SetOutputToDefaultAudioDevice();
            }
            if (notice.Severity == "critical") speaker.SpeakAsyncCancelAll();
            speaker.SpeakAsync(korean ? notice.Message : notice.English);
        }
        catch (Exception e) when (e is InvalidOperationException or COMException or PlatformNotSupportedException)
        { Activity?.Invoke("음성 엔진을 사용할 수 없어 화면에 알림을 표시합니다."); }
    }
    public void Dispose() { speaker?.SpeakAsyncCancelAll(); speaker?.Dispose(); }
}
