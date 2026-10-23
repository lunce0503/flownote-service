$ErrorActionPreference = 'Stop'
Set-Location (Join-Path $PSScriptRoot '..')
$version = node scripts/check-release.mjs
if ($LASTEXITCODE -ne 0) { throw 'Version validation failed' }
dotnet run --project tests/Flownote.Remote.Checks -c Release
if ($LASTEXITCODE -ne 0) { throw 'Core checks failed' }
$publishDir = Join-Path $PWD 'artifacts/windows'
dotnet publish src/Flownote.Remote.Windows -c Release -r win-x64 --self-contained true -p:PublishSingleFile=true -p:IncludeNativeLibrariesForSelfExtract=true -p:DebugType=None -p:DebugSymbols=false -o $publishDir
if ($LASTEXITCODE -ne 0) { throw 'Windows publish failed' }
$executable = Join-Path $PWD "artifacts/Flownote-Remote-$version-windows-x64.exe"
if (Test-Path $executable) { throw 'Release EXE already exists; use a fresh build directory' }
Copy-Item (Join-Path $publishDir 'Flownote.Remote.exe') $executable
Write-Output $executable
