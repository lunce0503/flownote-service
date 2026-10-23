using System.ComponentModel;
using Flownote.Remote.Network;

namespace Flownote.Remote.Windows;

public sealed class ClientRow(Guid id) : INotifyPropertyChanged
{
    public Guid Id { get; } = id;
    public string Name { get; private set; } = "";
    public string Summary { get; private set; } = "";
    public bool Enabled { get; private set; }
    public bool CanToggle { get; private set; }
    public string ToggleLabel => Name + " 사용";
    public string ToggleId => "DeviceEnabled-" + Id.ToString("N");
    public string ToggleHint => CanToggle ? "이 기기의 카메라와 소리 제어 사용 여부" : "다른 기기의 사용 여부는 서버에서 변경합니다.";
    public string MenuLabel => Name + " 더 보기";
    public event PropertyChangedEventHandler? PropertyChanged;
    public void Update(DeviceState device, HubState state, bool server, Guid? self)
    {
        Name = device.Name; Enabled = server ? device.Allowed : device.Enabled;
        CanToggle = server || state.Capabilities?.ClientParticipation == true && device.Id == self && device.Allowed && device.Connected;
        var features = new List<string>();
        if (!device.Connected) features.Add("오프라인");
        else if (!device.Enabled) features.Add(device.Allowed ? "사용 일시 중지" : "서버에서 사용 중지");
        else
        {
            features.Add(device.Platform);
            features.Add(device.OutputReady ? (device.Muted ? "소리 음소거" : $"소리 {device.Volume:P0}") : "출력 장치 확인 필요");
            if (device.CameraActive) features.Add("카메라 전송 중");
            if (state.VoiceTarget == device.Id && device.SpeakAlerts) features.Add("음성 알림");
            if (state.GestureTarget == device.Id) features.Add("제어 대상");
        }
        Summary = string.Join(" · ", features); PropertyChanged?.Invoke(this, new(null));
    }
}
