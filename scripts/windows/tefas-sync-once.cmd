@echo off
setlocal
rem Repo kökü (bu dosya: scripts\windows\)
pushd "%~dp0..\.."
if not exist "scripts\sync-tefas-funds.js" (
  echo Hata: sync-tefas-funds.js bulunamadi. Klasor: %CD%
  popd
  exit /b 1
)
where node >nul 2>nul
if errorlevel 1 (
  echo Hata: PATH icinde node yok.
  popd
  exit /b 1
)
node scripts\sync-tefas-funds.js
set ERR=%ERRORLEVEL%
popd
exit /b %ERR%
