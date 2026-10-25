using System.Globalization;
using System.Windows;
using System.Windows.Controls;
using System.Windows.Input;
using System.Windows.Media;
using Flownote.Remote.Core;
using Flownote.Remote.Network;

namespace Flownote.Remote.Windows;

public partial class NetworkWindow
{
    private sealed record CameraPreference(string Facing, string? DeviceId);
    private sealed record CameraOption(string Name, string Facing, string? Id);
    private CameraPreference cameraPreference = new("front",null);
    private readonly InterfaceViewport viewport = new();
    private double activeThreshold = .8;
    private string taskSignature = "";
    private void ClearScopedState()
    {
        taskSignature = ""; TaskChoice.ItemsSource = null; ActiveTaskName.Text = "연결되지 않음";
        ActiveTaskDetails.Text = ""; ActiveTaskDetails.Visibility = Visibility.Collapsed;
    }
    private string PrecisionMode => PinchEnabled?.IsChecked == true && PrecisionChoice is not null
        ? new[] { "volume", "zoom", "move" }[Math.Clamp(PrecisionChoice.SelectedIndex,0,2)] : "off";
    private async void Precision_Changed(object sender, RoutedEventArgs e)
    {
        if (ExactValue is not null && sender == PrecisionChoice) ExactValue.Text = PrecisionChoice.SelectedIndex == 1 ? "100" : "50";
        if (loaded) await Guard(() => vision.PrecisionAsync(PrecisionMode));
    }
    protected override void OnPreviewKeyDown(KeyEventArgs e)
    { if (e.Key == Key.Escape && PinchEnabled.IsChecked == true) { PinchEnabled.IsChecked = false; e.Handled = true; } base.OnPreviewKeyDown(e); }
    private void RefreshScopedState(HubState value)
    {
        var tasks = value.Tasks ?? [];
        string signature = string.Join(';',tasks.Select(t => t.Id+":"+t.Name));
        if (signature != taskSignature) { taskSignature = signature; TaskChoice.ItemsSource = tasks; }
        TaskChoice.SelectedValue = value.SelectedTask;
        var task = tasks.FirstOrDefault(t => t.Id == value.SelectedTask);
        ActiveTaskName.Text = task?.Name ?? "실행 중인 작업 없음";
        ActiveTaskDetails.Text = task is null ? "서버에 연결된 Codex 작업을 선택하면 확인할 수 있어요." : $"종류: {task.Kind}\n실행 세션: {task.Id}";
        if (CameraControl.IsChecked == true && value.DetectionThreshold > activeThreshold+.0001)
        { _ = Guard(StopCameraAsync); Log("인식 기준이 바뀌었습니다. 카메라를 다시 켜 주세요."); }
    }
    private async void TaskChoice_Changed(object sender, SelectionChangedEventArgs e) => await Guard(async () =>
    { if (!refreshing && client is { Connected: true, Enabled: true } && TaskChoice.SelectedItem is RemoteTask task) await client.SelectTaskAsync(task.Id); });
    private async void ExactApply_Click(object sender, RoutedEventArgs e) => await Guard(async () =>
    {
        if (client is not { Connected: true, Enabled: true } || !target.HasValue) { Log("사용할 기기를 연결하세요."); return; }
        bool Parse(TextBox box,out double value) => double.TryParse(box.Text,NumberStyles.Float,CultureInfo.CurrentCulture,out value) && double.IsFinite(value);
        if (!Parse(ExactValue,out double value) || !Parse(ExactX,out double x) || !Parse(ExactY,out double y)) { Log("숫자를 입력하세요."); return; }
        value /= 100; x /= 100; y /= 100;
        int mode = PrecisionChoice.SelectedIndex;
        var command = new InterfaceCommand(Guid.NewGuid(),"precision",mode == 0 ? "audio.set" : mode == 1 ? "interface.zoom_set" : "interface.pan_set",value,x,y);
        if (!RemoteHub.ValidManual(command)) { Log("음량 0–100, 확대 50–200, 위치 -100–100 범위를 확인하세요."); return; }
        await client.ControlAsync(target.Value,command.Action,value,x,y);
    });
    private async void ResetView_Click(object sender, RoutedEventArgs e) => await Guard(async () =>
    { if (client is { Connected: true, Enabled: true } && target.HasValue) await client.ControlAsync(target.Value,"interface.reset"); });
    private Task<InterfaceResult> ApplyInterfaceAsync(InterfaceCommand command) => Dispatcher.InvokeAsync(() =>
    {
        try
        {
            command.Validate(); viewport.Apply(command.Action,command.Value,command.X,command.Y);
            switch (command.Action)
            {
                case "interface.minimize": WindowState = WindowState.Minimized; break;
                case "interface.restore": WindowState = WindowState.Normal; Show(); break;
                case "task.focus":
                    if (state?.Tasks?.Any(t => t.Id == command.TaskId) != true) return new InterfaceResult(false,Error:"task_unavailable");
                    WindowState = WindowState.Normal; TaskViewport.BringIntoView(); Activate(); break;
                case "interface.details": ActiveTaskDetails.Visibility = ActiveTaskDetails.Visibility == Visibility.Visible ? Visibility.Collapsed : Visibility.Visible; break;
            }
            var transforms = new TransformGroup(); transforms.Children.Add(new ScaleTransform(viewport.Zoom,viewport.Zoom));
            transforms.Children.Add(new TranslateTransform(viewport.X*TaskViewport.ActualWidth*.35,viewport.Y*TaskViewport.ActualHeight*.35)); ControlledPane.RenderTransform = transforms;
            return new InterfaceResult(true,viewport.Zoom,viewport.X,viewport.Y);
        }
        catch (ArgumentException) { return new InterfaceResult(false,Error:"unsupported_interface_command"); }
    }).Task;
    private async void CameraSource_Click(object sender, RoutedEventArgs e) => await Guard(async () =>
    {
        var options = new List<CameraOption> { new("전면 카메라","front",null),new("후면 카메라 (환경 방향)","back",null) };
        if (loaded) options.AddRange((await vision.CamerasAsync()).Where(d => d.Id.Length > 0).Select(d => new CameraOption(d.Name,"external",d.Id)));
        var panel = new StackPanel { Margin = new Thickness(20) }; var choice = new ComboBox { MinHeight = 40 };
        System.Windows.Automation.AutomationProperties.SetAutomationId(choice,"CameraSourceChoice");
        for (int i = 0; i < options.Count; i++)
        {
            var item = new ComboBoxItem { Content = options[i].Name, Tag = options[i] };
            System.Windows.Automation.AutomationProperties.SetAutomationId(item,"CameraSource-"+i); choice.Items.Add(item);
        }
        void DescribeChoice() => System.Windows.Automation.AutomationProperties.SetName(choice,"카메라 방향 · "+((choice.SelectedItem as ComboBoxItem)?.Content ?? "선택 안 됨"));
        choice.SelectionChanged += (_, _) => DescribeChoice();
        choice.SelectedIndex = Math.Max(0,options.FindIndex(o => o.Facing == cameraPreference.Facing && o.Id == cameraPreference.DeviceId));
        DescribeChoice(); panel.Children.Add(choice);
        panel.Children.Add(new TextBlock { Text = "후면/선택 장치가 없으면 다른 장치로 자동 대체하지 않습니다.", TextWrapping = TextWrapping.Wrap, Margin = new Thickness(0,12,0,12) });
        var apply = new Button { Content = "카메라 선택" }; panel.Children.Add(apply); var dialog = new Window { Owner = this, Title = "카메라 선택", Width = Math.Min(440,SystemParameters.WorkArea.Width), SizeToContent = SizeToContent.Height, Content = panel, WindowStartupLocation = WindowStartupLocation.CenterOwner };
        System.Windows.Automation.AutomationProperties.SetAutomationId(dialog,"CameraSourceDialog");
        System.Windows.Automation.AutomationProperties.SetAutomationId(apply,"ApplyCameraSource");
        apply.Click += async (_, _) => await Guard(async () =>
        {
            if (choice.SelectedItem is not ComboBoxItem { Tag: CameraOption chosen }) return;
            bool active = CameraControl.IsChecked == true; await StopCameraAsync(); cameraPreference = new(chosen.Facing,chosen.Id); PrivateStore.Save("camera",cameraPreference); dialog.Close();
            if (active && client is { Connected: true, Enabled: true }) { SetCameraToggle(true); activeThreshold = state?.DetectionThreshold ?? .8; await vision.StartCameraAsync(chosen.Facing,PrecisionMode,activeThreshold,deviceId:chosen.Id); }
        });
        dialog.ShowDialog();
    });
    private void GestureGuide_Click(object sender, RoutedEventArgs e)
    {
        string text = "세밀 조정은 키보드가 기본이며 핀치 모드를 직접 켰을 때만 인식합니다.\n\n" + string.Join("\n\n",GestureCatalog.All.Select(g =>
            $"[{(g.Scope == "all" ? "전체" : g.Scope == "management" ? "중간 관리" : "세밀 조정")}] {g.Name}\n{g.Motion}"));
        var body = new TextBlock { Text = text, TextWrapping = TextWrapping.Wrap, Margin = new Thickness(20) };
        new Window { Owner = this, Title = "범주별 제스처", Width = Math.Min(520,SystemParameters.WorkArea.Width), Height = Math.Min(650,SystemParameters.WorkArea.Height), Content = new ScrollViewer { Content = body }, WindowStartupLocation = WindowStartupLocation.CenterOwner }.ShowDialog();
    }
}
