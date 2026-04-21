#Requires -Version 5.1
param(
  [string] $PortfolioTaskName = 'PortfoyTakip-PortfolioSync-Every30m',
  [string] $AbdTaskName = 'PortfoyTakip-AbdSync-Every10m',
  [switch] $Unregister
)

$ErrorActionPreference = 'Stop'
$RepoRoot = (Resolve-Path (Join-Path $PSScriptRoot '..\..')).Path
$PortfolioCmd = Join-Path $PSScriptRoot 'portfolio-sync-once.cmd'
$AbdCmd = Join-Path $PSScriptRoot 'abd-sync-once.cmd'

function New-RepeatingDailyTrigger([string]$At, [int]$Minutes) {
  return New-ScheduledTaskTrigger -Once -At $At `
    -RepetitionInterval (New-TimeSpan -Minutes $Minutes) `
    -RepetitionDuration (New-TimeSpan -Days 1)
}

function Register-LocalTask([string]$TaskName, [string]$CmdPath, [string]$StartAt, [int]$IntervalMinutes, [string]$Description) {
  if (-not (Test-Path $CmdPath)) { throw "Bulunamadi: $CmdPath" }

  $action = New-ScheduledTaskAction `
    -Execute 'cmd.exe' `
    -Argument "/c `"$CmdPath`"" `
    -WorkingDirectory $RepoRoot

  $trigger = New-RepeatingDailyTrigger -At $StartAt -Minutes $IntervalMinutes

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
    -Description $Description | Out-Null

  Write-Host "Kaydedildi: $TaskName (her $IntervalMinutes dk)"
}

if ($Unregister) {
  Unregister-ScheduledTask -TaskName $PortfolioTaskName -Confirm:$false -ErrorAction SilentlyContinue
  Unregister-ScheduledTask -TaskName $AbdTaskName -Confirm:$false -ErrorAction SilentlyContinue
  Write-Host "Kaldirildi (veya yoktu): $PortfolioTaskName"
  Write-Host "Kaldirildi (veya yoktu): $AbdTaskName"
  exit 0
}

$node = Get-Command node -ErrorAction SilentlyContinue
if (-not $node) {
  throw 'PATH icinde node yok. Node kurulu ve kullanici PATH''inde olmali.'
}

Register-LocalTask `
  -TaskName $PortfolioTaskName `
  -CmdPath $PortfolioCmd `
  -StartAt '00:00' `
  -IntervalMinutes 30 `
  -Description 'portfoy-takip: local Portfolio sync, her 30 dakikada bir.'

Register-LocalTask `
  -TaskName $AbdTaskName `
  -CmdPath $AbdCmd `
  -StartAt '00:05' `
  -IntervalMinutes 10 `
  -Description 'portfoy-takip: local ABD sync, her 10 dakikada bir.'

Write-Host "Test: Start-ScheduledTask -TaskName '$PortfolioTaskName'"
Write-Host "Test: Start-ScheduledTask -TaskName '$AbdTaskName'"
