#Requires -Version 5.1
<#
.SYNOPSIS
  Her gün 20:00'de günlük admin raporunu e-posta ile gönderir (PC açıkken).

.EXAMPLE
  powershell -ExecutionPolicy Bypass -File .\scripts\windows\register-daily-admin-report-task.ps1

.EXAMPLE
  powershell -ExecutionPolicy Bypass -File .\scripts\windows\register-daily-admin-report-task.ps1 -Unregister
#>
param(
  [string] $TaskName = 'PortfoyTakip-DailyAdminReport-2000',
  [string] $At = '20:00',
  [switch] $Unregister
)

$ErrorActionPreference = 'Stop'
$RepoRoot = (Resolve-Path (Join-Path $PSScriptRoot '..\..')).Path
$CmdPath = Join-Path $PSScriptRoot 'daily-admin-report-once.cmd'

if ($Unregister) {
  Unregister-ScheduledTask -TaskName $TaskName -Confirm:$false -ErrorAction SilentlyContinue
  Write-Host "Kaldırıldı (veya yoktu): $TaskName"
  exit 0
}

if (-not (Test-Path $CmdPath)) {
  throw "Bulunamadı: $CmdPath"
}
if (-not (Test-Path (Join-Path $RepoRoot '.env'))) {
  Write-Warning ".env yok: SMTP ve DAILY_REPORT_TO tanımlı olmalı."
}

$node = Get-Command node -ErrorAction SilentlyContinue
if (-not $node) {
  throw 'PATH içinde node yok.'
}

$trigger = New-ScheduledTaskTrigger -Daily -At $At
$action = New-ScheduledTaskAction `
  -Execute 'cmd.exe' `
  -Argument "/c `"$CmdPath`"" `
  -WorkingDirectory $RepoRoot

$settings = New-ScheduledTaskSettingsSet `
  -AllowStartIfOnBatteries `
  -DontStopIfGoingOnBatteries `
  -StartWhenAvailable

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
  -Description "Omnifolio günlük admin raporu e-posta ($At, repo .env SMTP)" | Out-Null

Write-Host "Kayıtlı: $TaskName — her gün $At"
Write-Host "Test: cmd /c `"$CmdPath`""
Write-Host "Log: scripts\windows\daily-admin-report.log"
