#Requires -Version 5.1
<#
.SYNOPSIS
  EAS iOS TestFlight build + App Store Connect submit (tek seferlik).

.EXAMPLE
  powershell -ExecutionPolicy Bypass -File .\scripts\windows\ios-testflight-release-once.ps1
#>
$ErrorActionPreference = 'Stop'

$RepoRoot = (Resolve-Path (Join-Path $PSScriptRoot '..\..')).Path
$LogPath = Join-Path $PSScriptRoot 'ios-testflight-release.log'

function Write-Log([string]$Message) {
  $line = "[$(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')] $Message"
  Add-Content -Path $LogPath -Value $line -Encoding UTF8
  Write-Host $line
}

Set-Location $RepoRoot
Write-Log "=== iOS TestFlight release başladı ==="
Write-Log "Repo: $RepoRoot"

if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
  Write-Log 'HATA: PATH içinde node yok.'
  exit 1
}

$env:EAS_BUILD_AUTOCOMMIT = '1'

Write-Log 'EAS build (testflight) başlatılıyor…'
npm run ios:testflight:build -- --non-interactive 2>&1 | Tee-Object -FilePath $LogPath -Append
if ($LASTEXITCODE -ne 0) {
  Write-Log "HATA: ios:testflight:build çıkış kodu $LASTEXITCODE"
  exit $LASTEXITCODE
}

Write-Log 'Build OK — TestFlight submit başlatılıyor…'
npm run ios:testflight:submit -- --non-interactive --latest 2>&1 | Tee-Object -FilePath $LogPath -Append
if ($LASTEXITCODE -ne 0) {
  Write-Log "HATA: ios:testflight:submit çıkış kodu $LASTEXITCODE"
  exit $LASTEXITCODE
}

Write-Log '=== Tamamlandı: build + TestFlight submit ==='
exit 0
