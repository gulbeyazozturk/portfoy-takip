@echo off
setlocal
pushd "%~dp0..\.."
if not exist "scripts\sync-yurtdisi-list.js" (
  echo Hata: scriptler bulunamadi. Klasor: %CD%
  popd
  exit /b 1
)
where node >nul 2>nul
if errorlevel 1 (
  echo Hata: PATH icinde node yok.
  popd
  exit /b 1
)
node scripts\sync-yurtdisi-list.js || goto :err
node scripts\sync-yurtdisi-prices.js --mode=full --batch=500 --cycle-window=500 --cycle-every-min=10 --delay=180 || goto :err
node scripts\sync-yurtdisi-missing-prices.js --limit=160 --delay=140 || goto :err
popd
exit /b 0
:err
set ERR=%ERRORLEVEL%
popd
exit /b %ERR%
