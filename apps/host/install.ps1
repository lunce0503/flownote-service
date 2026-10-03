[CmdletBinding()]
param(
  [string]$Version = $env:REMOTE_HOST_VERSION,
  [string]$Prefix,
  [string]$SourceDirectory,
  [switch]$NoPathUpdate
)

$ErrorActionPreference = "Stop"
Set-StrictMode -Version Latest

$Repository = "lunce0503/flownote-service"
if ([string]::IsNullOrWhiteSpace($Prefix)) {
  $BaseDirectory = if ($env:LOCALAPPDATA) { $env:LOCALAPPDATA } else { $HOME }
  $Prefix = Join-Path $BaseDirectory "Flownote\RemoteHost"
}
$Prefix = [System.IO.Path]::GetFullPath($Prefix)

if ([string]::IsNullOrWhiteSpace($Version)) {
  $Headers = @{ Accept = "application/vnd.github+json"; "User-Agent" = "flownote-remote-host-installer" }
  $Releases = Invoke-RestMethod -Headers $Headers -Uri "https://api.github.com/repos/$Repository/releases?per_page=100"
  $Release = $Releases | Where-Object { $_.tag_name -match '^remote-host-v\d+\.\d+\.\d+$' } | Select-Object -First 1
  if (-not $Release) { throw "Remote Host release not found." }
  $Version = $Release.tag_name.Substring("remote-host-v".Length)
}
$Version = $Version -replace '^remote-host-v', ''
if ($Version -notmatch '^\d+\.\d+\.\d+$') { throw "Invalid Remote Host version: $Version" }

$NodeVersion = (& node.exe -p "process.versions.node").Trim()
if ($LASTEXITCODE -ne 0) { throw "Node.js is required." }
if ([int]($NodeVersion.Split('.')[0]) -lt 20) { throw "Node.js 20 or newer is required (found $NodeVersion)." }
if (-not (Get-Command npm.cmd -ErrorAction SilentlyContinue)) { throw "npm is required." }
if (-not (Get-Command tar.exe -ErrorAction SilentlyContinue)) { throw "Windows tar.exe is required." }

$Tag = "remote-host-v$Version"
$Asset = "$Tag.tar.gz"
$ChecksumAsset = "$Asset.sha256"
$TemporaryDirectory = Join-Path ([System.IO.Path]::GetTempPath()) "remote-host-install-$([guid]::NewGuid().ToString('N'))"
$ArchivePath = Join-Path $TemporaryDirectory $Asset
$ChecksumPath = Join-Path $TemporaryDirectory $ChecksumAsset
$PackageDirectory = Join-Path $TemporaryDirectory "package"
New-Item -ItemType Directory -Path $PackageDirectory -Force | Out-Null

try {
  if ($SourceDirectory) {
    $SourceDirectory = [System.IO.Path]::GetFullPath($SourceDirectory)
    Copy-Item -LiteralPath (Join-Path $SourceDirectory $Asset) -Destination $ArchivePath
    Copy-Item -LiteralPath (Join-Path $SourceDirectory $ChecksumAsset) -Destination $ChecksumPath
  } else {
    [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
    $BaseUrl = "https://github.com/$Repository/releases/download/$Tag"
    Invoke-WebRequest -Uri "$BaseUrl/$Asset" -OutFile $ArchivePath
    Invoke-WebRequest -Uri "$BaseUrl/$ChecksumAsset" -OutFile $ChecksumPath
  }

  $ChecksumLine = (Get-Content -LiteralPath $ChecksumPath -Raw).Trim()
  if ($ChecksumLine -notmatch '^([a-fA-F0-9]{64})\s+remote-host-v\d+\.\d+\.\d+\.tar\.gz$') {
    throw "Invalid checksum file."
  }
  $ExpectedChecksum = $Matches[1]
  $ActualChecksum = (Get-FileHash -LiteralPath $ArchivePath -Algorithm SHA256).Hash
  if (-not $ActualChecksum.Equals($ExpectedChecksum, [StringComparison]::OrdinalIgnoreCase)) {
    throw "SHA-256 checksum mismatch."
  }

  $ArchiveEntries = & tar.exe -tzf $ArchivePath
  if ($LASTEXITCODE -ne 0) { throw "Unable to inspect the release archive." }
  foreach ($Entry in $ArchiveEntries) {
    if ($Entry -notlike "$Tag/*" -or $Entry -match '(^|/)\.\.(/|$)' -or $Entry.StartsWith('/') -or $Entry.StartsWith('\')) {
      throw "Unsafe archive entry: $Entry"
    }
  }
  & tar.exe -xzf $ArchivePath --strip-components=1 -C $PackageDirectory
  if ($LASTEXITCODE -ne 0) { throw "Unable to extract the release archive." }

  Push-Location $PackageDirectory
  try {
    & npm.cmd ci --omit=dev --no-audit --no-fund
    if ($LASTEXITCODE -ne 0) { throw "npm dependency installation failed." }
    & node.exe (Join-Path $PackageDirectory "dist\cli.js") version | Out-Null
    if ($LASTEXITCODE -ne 0) { throw "Remote Host CLI validation failed." }
  } finally {
    Pop-Location
  }

  $InstallRoot = Join-Path $Prefix "versions"
  $InstallDirectory = Join-Path $InstallRoot $Version
  $BinDirectory = Join-Path $Prefix "bin"
  New-Item -ItemType Directory -Path $InstallRoot, $BinDirectory -Force | Out-Null
  if (Test-Path -LiteralPath $InstallDirectory) { Remove-Item -LiteralPath $InstallDirectory -Recurse -Force }
  Move-Item -LiteralPath $PackageDirectory -Destination $InstallDirectory

  $CliPath = Join-Path $InstallDirectory "dist\cli.js"
  $EscapedCliPath = $CliPath.Replace('%', '%%')
  $ShimPath = Join-Path $BinDirectory "remote-host.cmd"
  Set-Content -LiteralPath $ShimPath -Encoding Ascii -Value "@echo off`r`nnode.exe `"$EscapedCliPath`" %*`r`n"

  if (-not $NoPathUpdate) {
    $UserPath = [Environment]::GetEnvironmentVariable("Path", "User")
    $PathEntries = @($UserPath -split ';' | Where-Object { $_ })
    if (-not ($PathEntries | Where-Object { $_.TrimEnd('\') -ieq $BinDirectory.TrimEnd('\') })) {
      $NewUserPath = (@($PathEntries) + $BinDirectory) -join ';'
      [Environment]::SetEnvironmentVariable("Path", $NewUserPath, "User")
    }
  }

  Write-Host "Installed Flownote Remote Host $Version"
  Write-Host "Executable: $ShimPath"
  Write-Host "Open a new terminal, then run: remote-host doctor"
  Write-Host "Next: remote-host init --host <LAN_OR_VPN_IP> --bind <LAN_OR_VPN_IP>"
} finally {
  if (Test-Path -LiteralPath $TemporaryDirectory) {
    Remove-Item -LiteralPath $TemporaryDirectory -Recurse -Force
  }
}
