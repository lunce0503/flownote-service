$ErrorActionPreference = 'Stop'
Set-Location (Join-Path $PSScriptRoot '..')
$version = node scripts/check-release.mjs
if ($LASTEXITCODE -ne 0) { throw 'Version validation failed' }
dotnet run --project tests/Flownote.Remote.Checks -c Release
if ($LASTEXITCODE -ne 0) { throw 'Core checks failed' }
$publishDir = Join-Path $PWD 'artifacts/windows'
dotnet publish src/Flownote.Remote.Windows -c Release -r win-x64 --self-contained true -p:PublishSingleFile=true -p:IncludeNativeLibrariesForSelfExtract=true -p:DebugType=None -p:DebugSymbols=false -o $publishDir
if ($LASTEXITCODE -ne 0) { throw 'Windows publish failed' }
Copy-Item packaging/windows-README.md (Join-Path $publishDir 'README.md')
Copy-Item "release-notes/v$version.md" (Join-Path $publishDir 'RELEASE_NOTES.md')
Copy-Item THIRD-PARTY-NOTICES.md (Join-Path $publishDir 'THIRD-PARTY-NOTICES.md')
Copy-Item packaging/dotnet-LICENSE.txt (Join-Path $publishDir 'licenses/dotnet-LICENSE.txt')
$archive = Join-Path $PWD "artifacts/Flownote-Remote-$version-windows-x64.zip"
if (Test-Path $archive) { throw 'Archive already exists; use a fresh build directory' }
Compress-Archive -Path "$publishDir/*" -DestinationPath $archive
Write-Output $archive
