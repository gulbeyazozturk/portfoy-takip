#Requires -Version 5.1
<#
.SYNOPSIS
  Belirtilen süre sonra (varsayılan 6 saat) iOS TestFlight build+submit çalıştırır.

.EXAMPLE
  powershell -ExecutionPolicy Bypass -File .\scripts\windows\register-ios-testflight-once-task.ps1

.EXAMPLE
  powershell -ExecutionPolicy Bypass -File .\scripts\windows\register-ios-testflight-once-task.ps1 -Hours 6

.EXAMPLE
  powershell -ExecutionPolicy Bypass -File .\scripts\windows\register-ios-testflight-once-task.ps1 -Unregister
#>
param(
  [string] $TaskName = 'PortfoyTakip-iOS-TestFlight-Once',
  [double] $Hours = 6,
  [switch] $Unregister
)

$ErrorActionPreference = 'Stop'
$RepoRoot = (Resolve-Path (Join-Path $PSScriptRoot '..\..')).Path
$Ps1Path = Join-Path $PSScriptRoot 'ios-testflight-release-once.ps1'

if ($Unregister) {
  Unregister-ScheduledTask -TaskName $TaskName -Confirm:$false -ErrorAction SilentlyContinue
  Write-Host "Kaldırıldı (veya yoktu): $TaskName"
  exit 0
}

if (-not (Test-Path $Ps1Path)) {
  throw "Bulunamadı: $Ps1Path"
}

$runAt = (Get-Date).AddHours($Hours)
$runAtStr = $runAt.ToString('HH:mm')
$runDateStr = $runAt.ToString('yyyy-MM-dd')

$trigger = New-ScheduledTaskTrigger -Once -At $runAt
$action = New-ScheduledTaskAction `
  -Execute 'powershell.exe' `
  -Argument "-NoProfile -ExecutionPolicy Bypass -File `"$Ps1Path`"" `
  -WorkingDirectory $RepoRoot

$settings = New-ScheduledTaskSettingsSet `
  -AllowStartIfOnBatteries `
  -DontStopIfGoingOnBatteries `
  -StartWhenAvailable `
  -ExecutionTimeLimit (New-TimeSpan -Hours 3)

$principal = New-ScheduledTaskPrincipal `
  -UserId $env:USERNAME `
  -LogonType Interactive `
  -RunLevel Limited

$existing = Get-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue
if ($existing) {
  Unregister-ScheduledTask -TaskName $TaskName -Confirm:$false
}

Register-ScheduledTask `
  -TaskName $TaskName `
  -Action $action `
  -Trigger $trigger `
  -Settings $settings `
  -Principal $principal `
  -Description "Omnifolio iOS TestFlight build+submit (tek sefer, EAS kotası sonrası)" | Out-Null

Write-Host "Kayıtlı: $TaskName"
Write-Host "Çalışma zamanı: $runDateStr $runAtStr (yaklaşık $Hours saat sonra)"
Write-Host "Log: scripts\windows\ios-testflight-release.log"
Write-Host "Manuel test: powershell -ExecutionPolicy Bypass -File `"$Ps1Path`""
Write-Host "İptal: powershell -ExecutionPolicy Bypass -File `"$PSCommandPath`" -Unregister"
