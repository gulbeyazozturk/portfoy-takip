@echo off
setlocal
pushd "%~dp0..\.."
if not exist "scripts\sync-crypto-prices.js" (
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
node scripts\sync-crypto-prices.js || goto :err
node scripts\sync-bist-scrape.js || goto :err
node scripts\sync-doviz-dev.js || goto :err
node scripts\sync-emtia-scrape.js || goto :err
node scripts\sync-kapalicarsi-gold.js || goto :err
node scripts\sync-yurtdisi-prices.js --mode=holdings --batch=500 --delay=140 || goto :err
node scripts\snapshot-prices.js || goto :err
popd
exit /b 0
:err
set ERR=%ERRORLEVEL%
popd
exit /b %ERR%
