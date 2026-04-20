#Requires -Version 5.1
<#
.SYNOPSIS
  Windows Görev Zamanlayıcı'da TEFAS yerel senkronu: her gün 07:30, 08:30, ... 12:30 (bilgisayar saati = TSİ varsayılır).

.DESCRIPTION
  Çalıştırır: repo kökünde node scripts/sync-tefas-funds.js (.env gerekli).
  Varsayılan olarak yalnızca oturum açıkken çalışır (Interactive).

.PARAMETER TaskName
  Görev adı (benzersiz olmalı).

.PARAMETER Unregister
  Bu ada sahip görevi kaldırır.

.EXAMPLE
  powershell -ExecutionPolicy Bypass -File .\scripts\windows\register-tefas-morning-task.ps1

.EXAMPLE
  powershell -ExecutionPolicy Bypass -File .\scripts\windows\register-tefas-morning-task.ps1 -Unregister
#>
param(
  [string] $TaskName = 'PortfoyTakip-TEFAS-0730-1230',
  [switch] $Unregister
)

$ErrorActionPreference = 'Stop'
$RepoRoot = (Resolve-Path (Join-Path $PSScriptRoot '..\..')).Path
$CmdPath = Join-Path $PSScriptRoot 'tefas-sync-once.cmd'

if ($Unregister) {
  Unregister-ScheduledTask -TaskName $TaskName -Confirm:$false -ErrorAction SilentlyContinue
  Write-Host "Kaldırıldı (veya yoktu): $TaskName"
  exit 0
}

if (-not (Test-Path $CmdPath)) {
  throw "Bulunamadı: $CmdPath"
}
if (-not (Test-Path (Join-Path $RepoRoot 'scripts\sync-tefas-funds.js'))) {
  throw "Repo kökü yanlış olabilir: $RepoRoot"
}

$node = Get-Command node -ErrorAction SilentlyContinue
if (-not $node) {
  throw 'PATH içinde node yok. Node kurulu ve kullanıcı PATH''inde olmalı.'
}

$times = @('07:30', '08:30', '09:30', '10:30', '11:30', '12:30')
$triggers = foreach ($t in $times) {
  New-ScheduledTaskTrigger -Daily -At $t
}

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
  -Trigger $triggers `
  -Settings $settings `
  -Principal $principal `
  -Description 'portfoy-takip: TEFAS (sync-tefas-funds.js), günlük 07:30-12:30 saat başı :30.'

Write-Host "Kaydedildi: $TaskName"
Write-Host "Test: Start-ScheduledTask -TaskName '$TaskName'"
Write-Host "Görev Zamanlayıcı: taskschd.msc -> görev adını ara"
