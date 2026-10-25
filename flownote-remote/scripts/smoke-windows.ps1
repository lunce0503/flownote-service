param([Parameter(Mandatory=$true)][string]$Executable)
$ErrorActionPreference = 'Stop'
if ($env:GITHUB_ACTIONS -ne 'true') { throw 'Run on a disposable Actions runner' }
Add-Type -AssemblyName UIAutomationClient
Add-Type -AssemblyName UIAutomationTypes
Add-Type -AssemblyName System.Drawing
$settingsFile = Join-Path $env:LOCALAPPDATA 'Flownote/Remote/settings.json'
if (Test-Path $settingsFile) { throw 'A fresh settings profile is required' }
function Find-Control($root, $id) {
    $element = $root.FindFirst([System.Windows.Automation.TreeScope]::Descendants,
        [System.Windows.Automation.PropertyCondition]::new([System.Windows.Automation.AutomationElement]::AutomationIdProperty, $id))
    if (!$element) { throw "Missing UI control: $id" }; return $element
}
function Find-ProcessControl($processId, $id) {
    $condition = [System.Windows.Automation.AndCondition]::new(
        [System.Windows.Automation.PropertyCondition]::new([System.Windows.Automation.AutomationElement]::ProcessIdProperty, $processId),
        [System.Windows.Automation.PropertyCondition]::new([System.Windows.Automation.AutomationElement]::AutomationIdProperty, $id))
    for ($attempt=0; $attempt -lt 40; $attempt++) {
        $element = [System.Windows.Automation.AutomationElement]::RootElement.FindFirst([System.Windows.Automation.TreeScope]::Descendants, $condition)
        if ($element) { return $element }; Start-Sleep -Milliseconds 250
    }
    throw "Missing process UI control: $id"
}
function Invoke-Control($control) { $control.GetCurrentPattern([System.Windows.Automation.InvokePattern]::Pattern).Invoke() }
function Close-Window($control) { $control.GetCurrentPattern([System.Windows.Automation.WindowPattern]::Pattern).Close() }
function Close-App($app) {
    $requested=$false
    for ($attempt=0; $attempt -lt 40; $attempt++) {
        $app.Process.Refresh()
        if ($app.Process.HasExited) { return }
        if ($app.Root.Current.IsEnabled -and $app.Process.CloseMainWindow()) { $requested=$true; break }
        Start-Sleep -Milliseconds 250
    }
    if (!$requested) { throw 'Dashboard remained disabled after closing its modal settings window' }
    if (!$app.Process.WaitForExit(15000)) { throw 'Dashboard did not close after a confirmed close request' }
}
function Read-Text($root, $id) { return (Find-Control $root $id).Current.Name }
function Open-App {
    $process = Start-Process -FilePath $Executable -PassThru
    for ($attempt=0; $attempt -lt 60; $attempt++) {
        $process.Refresh(); if ($process.HasExited) { throw "Application exited: $($process.ExitCode)" }
        if ($process.MainWindowHandle -ne 0) {
            $root = [System.Windows.Automation.AutomationElement]::FromHandle($process.MainWindowHandle)
            if ($root.FindFirst([System.Windows.Automation.TreeScope]::Descendants,
                [System.Windows.Automation.PropertyCondition]::new([System.Windows.Automation.AutomationElement]::AutomationIdProperty, 'DashboardMore'))) {
                return @{ Process=$process; Root=$root }
            }
        }; Start-Sleep -Milliseconds 500
    }; throw 'Dashboard did not open'
}
function Open-Settings($app) {
    Invoke-Control (Find-Control $app.Root 'DashboardMore')
    Invoke-Control (Find-ProcessControl $app.Process.Id 'OpenSettingsMenu')
    return Find-ProcessControl $app.Process.Id 'GestureSettings'
}
function Save-Screenshot($root, $name) {
    $bounds=$root.Current.BoundingRectangle
    $bitmap=[System.Drawing.Bitmap]::new([int]$bounds.Width,[int]$bounds.Height)
    $graphics=[System.Drawing.Graphics]::FromImage($bitmap)
    try {
        $graphics.CopyFromScreen([int]$bounds.X,[int]$bounds.Y,0,0,$bitmap.Size)
        New-Item -ItemType Directory -Force -Path 'artifacts/ux' | Out-Null
        $bitmap.Save((Join-Path $PWD "artifacts/ux/$name.png"),[System.Drawing.Imaging.ImageFormat]::Png)
    } finally { $graphics.Dispose(); $bitmap.Dispose() }
}
function Scroll-Dashboard($root, $vertical) {
    $scroll=(Find-Control $root 'DashboardScroll').GetCurrentPattern([System.Windows.Automation.ScrollPattern]::Pattern)
    $scroll.SetScrollPercent([System.Windows.Automation.ScrollPattern]::NoScroll,$vertical)
    Start-Sleep -Milliseconds 400
}
$app=$null
try {
    $app=Open-App
    # Details are reached through the overflow menu; the initial screen is the dashboard.
    Find-Control $app.Root 'ClientList' | Out-Null
    Find-Control $app.Root 'CameraControl' | Out-Null
    if ((Find-Control $app.Root 'PinchEnabled').GetCurrentPattern([System.Windows.Automation.TogglePattern]::Pattern).Current.ToggleState -ne [System.Windows.Automation.ToggleState]::Off) { throw 'Pinch must default OFF' }
    Invoke-Control (Find-Control $app.Root 'ChooseCameraSource')
    $source=Find-ProcessControl $app.Process.Id 'CameraSourceDialog'
    $choice=Find-Control $source 'CameraSourceChoice'
    # WPF exposes the display text separately from selectable item peers.
    # Exercise the keyboard path (front=Home, rear=Down) instead of invoking a TextBlock pattern.
    $choice.SetFocus()
    $keyboard=New-Object -ComObject WScript.Shell
    $keyboard.SendKeys('{HOME}{DOWN}{ENTER}')
    Start-Sleep -Milliseconds 350
    Invoke-Control (Find-Control $source 'ApplyCameraSource')
    Start-Sleep -Milliseconds 350
    $settings=Open-Settings $app
    $enabled=(Find-Control $settings 'Enabled').GetCurrentPattern([System.Windows.Automation.TogglePattern]::Pattern)
    if ($enabled.Current.ToggleState -ne [System.Windows.Automation.ToggleState]::Off) { throw 'Gestures must default OFF' }
    $enabled.Toggle()
    (Find-Control $settings 'Confidence').GetCurrentPattern([System.Windows.Automation.RangeValuePattern]::Pattern).SetValue(90)
    $save=$settings.FindFirst([System.Windows.Automation.TreeScope]::Descendants,
        [System.Windows.Automation.PropertyCondition]::new([System.Windows.Automation.AutomationElement]::NameProperty,'설정 저장'))
    Invoke-Control $save
    for ($attempt=0; $attempt -lt 20 -and !(Test-Path $settingsFile); $attempt++) { Start-Sleep -Milliseconds 250 }
    $saved=Get-Content $settingsFile -Raw | ConvertFrom-Json
    if (!$saved.gesturesEnabled -or $saved.confidenceThreshold -ne 0.9) { throw 'Settings save failed' }
    Invoke-Control (Find-Control $settings 'ShowLicenses')
    $notices=Find-ProcessControl $app.Process.Id 'LicensesWindow'
    $licenseText=(Find-Control $notices 'LicenseText').GetCurrentPattern([System.Windows.Automation.ValuePattern]::Pattern).Current.Value
    if (!$licenseText.Contains('Copyright (c) 2026 Lunce') -or !$licenseText.Contains('ZXing')) { throw 'Embedded notices are missing' }
    Close-Window $notices; Close-Window $settings
    Close-App $app
    $app=Open-App; $settings=Open-Settings $app
    if ((Find-Control $settings 'Confidence').GetCurrentPattern([System.Windows.Automation.RangeValuePattern]::Pattern).Current.Value -ne 90) { throw 'Settings did not restore' }
    Close-Window $settings
    Invoke-Control (Find-Control $app.Root 'ChooseCameraSource')
    $source=Find-ProcessControl $app.Process.Id 'CameraSourceDialog'
    $choice=Find-Control $source 'CameraSourceChoice'
    $selected=$choice.FindFirst([System.Windows.Automation.TreeScope]::Descendants,
        [System.Windows.Automation.PropertyCondition]::new([System.Windows.Automation.AutomationElement]::NameProperty,'후면 카메라 (환경 방향)'))
    if (!$selected -or $selected.Current.IsOffscreen) { throw 'Camera source did not restore after restart' }
    Close-Window $source
    $ready=$false
    for ($attempt=0; $attempt -lt 120; $attempt++) {
        $notice=Read-Text $app.Root 'RecentNotice'
        if ($notice.Contains('카메라 입력 준비됨')) { $ready=$true; break }
        if ($notice.Contains('준비 실패')) { throw 'Packaged WebView2 initialization failed' }
        Start-Sleep -Milliseconds 500
    }
    if (!$ready) { throw 'WebView2 initialization timed out' }
    Invoke-Control (Find-Control $app.Root 'StartServer')
    $started=$false
    for ($attempt=0; $attempt -lt 120; $attempt++) {
        $notice=Read-Text $app.Root 'RecentNotice'
        if ($notice.Contains('서버 시작됨')) { $started=$true; break }
        if ($notice.Contains('실패')) {
            Invoke-Control (Find-Control $app.Root 'DashboardMore'); Invoke-Control (Find-ProcessControl $app.Process.Id 'OpenDetailsMenu')
            $details=Find-ProcessControl $app.Process.Id 'DiagnosticsPanel'
            $events=(Find-Control $details 'Events').GetCurrentPattern([System.Windows.Automation.ValuePattern]::Pattern).Current.Value
            throw "Packaged server startup failed: $events"
        }; Start-Sleep -Milliseconds 500
    }
    if (!$started) { throw 'Packaged server startup timed out' }
    $device=Find-Control $app.Root 'DeviceEnabled-00000000000000000000000000000000'
    $toggle=$device.GetCurrentPattern([System.Windows.Automation.TogglePattern]::Pattern); $toggle.Toggle()
    Start-Sleep -Seconds 4
    if ($toggle.Current.ToggleState -ne [System.Windows.Automation.ToggleState]::Off) { throw 'Client pause did not survive a state refresh' }
    $toggle.Toggle(); Start-Sleep -Seconds 4
    if ($toggle.Current.ToggleState -ne [System.Windows.Automation.ToggleState]::On) { throw 'Client resume did not survive a state refresh' }
    Invoke-Control (Find-Control $app.Root 'AddClient')
    $pairing=Find-ProcessControl $app.Process.Id 'PairingPanel'
    Find-Control $pairing 'RenewPairing' | Out-Null
    Close-Window $pairing
    # Capture only the dashboard: invitation QR/code dialogs must never be uploaded.
    Scroll-Dashboard $app.Root 0
    Save-Screenshot $app.Root 'dashboard-windows'
    Scroll-Dashboard $app.Root 100
    Save-Screenshot $app.Root 'clients-windows'
    $transform=$app.Root.GetCurrentPattern([System.Windows.Automation.TransformPattern]::Pattern)
    $height=[Math]::Min(720,$app.Root.Current.BoundingRectangle.Height)
    $transform.Resize(420,$height); Start-Sleep -Seconds 1
    Scroll-Dashboard $app.Root 0
    Save-Screenshot $app.Root 'dashboard-windows-narrow'
    Scroll-Dashboard $app.Root 100
    Save-Screenshot $app.Root 'clients-windows-narrow'
    Write-Output 'PASS: exact EXE dashboard, overflow settings/licenses, restart restore, offline model/TLS server, accessible client pause/resume and invitation panel'
} catch {
    Write-Output $_.ScriptStackTrace
    throw
} finally {
    if ($app -and !$app.Process.HasExited) {
        $app.Process.CloseMainWindow() | Out-Null
        if (!$app.Process.WaitForExit(5000)) { $app.Process.Kill() }
    }
}
