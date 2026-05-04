@echo off
setlocal
rem Repo kökü (bu dosya: scripts\windows\)
pushd "%~dp0..\.."
if not exist "scripts\sync-tefas-funds.js" (
  echo Hata: sync-tefas-funds.js bulunamadi. Klasor: %CD%
  popd
  exit /b 1
)

set "NODECMD=node"
if defined NODE_EXE set "NODECMD=%NODE_EXE%"

"%NODECMD%" -e "process.exit(0)" >nul 2>nul
if errorlevel 1 (
  echo [%date% %time%] Hata: Node calistirilamadi: %NODECMD% 1>>"%~dp0tefas-sync.log" 2>&1
  echo Hata: Node calistirilamadi: %NODECMD%
  echo Ipucu: Tam yolu ayarlayin: set NODE_EXE=C:\Program Files\nodejs\node.exe
  popd
  exit /b 1
)

echo [%date% %time%] TEFAS sync basliyor... 1>>"%~dp0tefas-sync.log" 2>&1
"%NODECMD%" scripts\sync-tefas-funds.js 1>>"%~dp0tefas-sync.log" 2>&1
set ERR=%ERRORLEVEL%
echo [%date% %time%] TEFAS sync bitti, ERRORLEVEL=%ERR% 1>>"%~dp0tefas-sync.log" 2>&1
popd
exit /b %ERR%
