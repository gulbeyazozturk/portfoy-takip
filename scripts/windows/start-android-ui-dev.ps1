# Hizli Android UI testi: emulatör + Expo Go (APK/EAS build gerekmez).
# Kullanim: .\scripts\windows\start-android-ui-dev.ps1

$ErrorActionPreference = "Stop"
$repoRoot = Split-Path (Split-Path $PSScriptRoot -Parent) -Parent
Set-Location $repoRoot

$sdk = if ($env:ANDROID_HOME) { $env:ANDROID_HOME } elseif (Test-Path "C:\Android\Sdk") { "C:\Android\Sdk" } else { $null }
if ($sdk) {
  $env:ANDROID_HOME = $sdk
  $env:ANDROID_SDK_ROOT = $sdk
  $env:Path = "$sdk\platform-tools;$sdk\emulator;" + $env:Path
}

$devices = & adb devices 2>&1 | Select-String "device$"
if (-not $devices) {
  Write-Host "Android emulatör bulunamadi. Android Studio > Device Manager ile bir AVD acin, sonra tekrar calistirin." -ForegroundColor Yellow
  exit 1
}

Write-Host "Emulator hazir. Expo Go ile baslatiliyor..." -ForegroundColor Cyan
npx expo start --android --go --port 8081
