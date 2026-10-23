param([Parameter(Mandatory=$true)][string]$Executable)
$ErrorActionPreference = 'Stop'
if ($env:GITHUB_ACTIONS -ne 'true') { throw 'Run this settings smoke only on a disposable GitHub Actions runner' }
Add-Type -AssemblyName UIAutomationClient
Add-Type -AssemblyName UIAutomationTypes
$settingsFile = Join-Path $env:LOCALAPPDATA 'Flownote/Remote/settings.json'
if (Test-Path $settingsFile) { throw 'Smoke requires a fresh settings profile' }
function Find-Control($root, $id) {
    $condition = [System.Windows.Automation.PropertyCondition]::new([System.Windows.Automation.AutomationElement]::AutomationIdProperty, $id)
    $control = $root.FindFirst([System.Windows.Automation.TreeScope]::Descendants, $condition)
    if (!$control) { throw "Missing UI control: $id" }
    return $control
}
function Open-App {
    $process = Start-Process -FilePath $Executable -PassThru
    for ($attempt = 0; $attempt -lt 60; $attempt++) {
        $process.Refresh()
        if ($process.HasExited) { throw "Application exited during startup: $($process.ExitCode)" }
        if ($process.MainWindowHandle -ne 0) {
            $root = [System.Windows.Automation.AutomationElement]::FromHandle($process.MainWindowHandle)
            if ($root.FindFirst([System.Windows.Automation.TreeScope]::Descendants,
                [System.Windows.Automation.PropertyCondition]::new([System.Windows.Automation.AutomationElement]::AutomationIdProperty, 'Confidence'))) {
                return @{ Process = $process; Root = $root }
            }
        }
        Start-Sleep -Milliseconds 500
    }
    throw 'Application window did not become ready'
}
$app = $null
try {
    $app = Open-App
    $showNotices = Find-Control $app.Root 'ShowLicenses'
    $showNotices.GetCurrentPattern([System.Windows.Automation.InvokePattern]::Pattern).Invoke()
    $noticeCondition = [System.Windows.Automation.AndCondition]::new(
        [System.Windows.Automation.PropertyCondition]::new([System.Windows.Automation.AutomationElement]::ProcessIdProperty, $app.Process.Id),
        [System.Windows.Automation.PropertyCondition]::new([System.Windows.Automation.AutomationElement]::AutomationIdProperty, 'LicensesWindow'))
    $noticeWindow = $null
    for ($attempt = 0; $attempt -lt 20 -and !$noticeWindow; $attempt++) {
        $noticeWindow = [System.Windows.Automation.AutomationElement]::RootElement.FindFirst([System.Windows.Automation.TreeScope]::Descendants, $noticeCondition)
        if (!$noticeWindow) { Start-Sleep -Milliseconds 250 }
    }
    if (!$noticeWindow) { throw 'Embedded license window did not open' }
    $noticeText = (Find-Control $noticeWindow 'LicenseText').GetCurrentPattern([System.Windows.Automation.ValuePattern]::Pattern).Current.Value
    if (!$noticeText.Contains('Copyright (c) 2026 Lunce') -or !$noticeText.Contains('.NET Foundation and Contributors')) { throw 'Required embedded licenses are missing' }
    $noticeWindow.GetCurrentPattern([System.Windows.Automation.WindowPattern]::Pattern).Close()
    $enabled = (Find-Control $app.Root 'Enabled').GetCurrentPattern([System.Windows.Automation.TogglePattern]::Pattern)
    if ($enabled.Current.ToggleState -ne [System.Windows.Automation.ToggleState]::Off) { throw 'Gestures must start disabled' }
    $enabled.Toggle()
    $confidence = (Find-Control $app.Root 'Confidence').GetCurrentPattern([System.Windows.Automation.RangeValuePattern]::Pattern)
    $confidence.SetValue(90)
    $condition = [System.Windows.Automation.PropertyCondition]::new([System.Windows.Automation.AutomationElement]::NameProperty, '설정 저장')
    $save = $app.Root.FindFirst([System.Windows.Automation.TreeScope]::Descendants, $condition)
    if (!$save) { throw 'Save button missing' }
    $save.GetCurrentPattern([System.Windows.Automation.InvokePattern]::Pattern).Invoke()
    for ($attempt = 0; $attempt -lt 20 -and !(Test-Path $settingsFile); $attempt++) { Start-Sleep -Milliseconds 250 }
    $settings = Get-Content $settingsFile -Raw | ConvertFrom-Json
    if (!$settings.gesturesEnabled -or $settings.confidenceThreshold -ne 0.9 -or $settings.assistantEnabled) { throw 'Saved settings mismatch' }
    $app.Process.CloseMainWindow() | Out-Null
    if (!$app.Process.WaitForExit(10000)) { throw 'Application did not close' }
    $app = Open-App
    $enabled = (Find-Control $app.Root 'Enabled').GetCurrentPattern([System.Windows.Automation.TogglePattern]::Pattern)
    $confidence = (Find-Control $app.Root 'Confidence').GetCurrentPattern([System.Windows.Automation.RangeValuePattern]::Pattern)
    if ($enabled.Current.ToggleState -ne [System.Windows.Automation.ToggleState]::On -or $confidence.Current.Value -ne 90) { throw 'Settings were not restored' }
    Write-Output 'PASS: standalone release EXE starts, displays embedded licenses, saves settings and restores them after restart'
} finally {
    if ($app -and !$app.Process.HasExited) {
        $app.Process.CloseMainWindow() | Out-Null
        if (!$app.Process.WaitForExit(5000)) { $app.Process.Kill() }
    }
}
