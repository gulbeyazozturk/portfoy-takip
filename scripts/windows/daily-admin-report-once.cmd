@echo off
setlocal
pushd "%~dp0..\.."
if not exist "scripts\send-daily-admin-report-email.js" (
  echo Hata: send-daily-admin-report-email.js bulunamadi.
  popd
  exit /b 1
)

set "NODECMD=node"
if defined NODE_EXE set "NODECMD=%NODE_EXE%"

"%NODECMD%" -e "process.exit(0)" >nul 2>nul
if errorlevel 1 (
  echo Hata: Node calistirilamadi: %NODECMD%
  popd
  exit /b 1
)

echo [%date% %time%] Gunluk rapor e-posta basliyor... 1>>"%~dp0daily-admin-report.log" 2>&1
"%NODECMD%" scripts\send-daily-admin-report-email.js 1>>"%~dp0daily-admin-report.log" 2>&1
set ERR=%ERRORLEVEL%
echo [%date% %time%] Bitti ERRORLEVEL=%ERR% 1>>"%~dp0daily-admin-report.log" 2>&1
popd
exit /b %ERR%
