# Local Windows price scheduler

Bu kurulum, bilgisayarinda Windows Task Scheduler ile uc yerel gorev olusturur:

- `PortfoyTakip-CryptoSync-Every5m` -> her **5 dk** (`:02`, `:07`, `:12`, ...)
- `PortfoyTakip-PortfolioSync-Every30m` -> her **30 dk** (`:00`, `:30`) — kripto yok
- `PortfoyTakip-AbdSync-Every10m` -> her **10 dk** (`:05`, `:15`, `:25`, ...)

Her iki gorev de repo altindaki Node scriptlerini calistirir; `.env` dosyasi ve `node` PATH'i gerekli.

## Kurulum

```powershell
cd "C:\Users\Haşim Öztürk\OneDrive\Desktop\CURSOR\portfoy-takip"
powershell -ExecutionPolicy Bypass -File .\scripts\windows\register-local-price-sync-tasks.ps1
```

## Elle test

```powershell
Start-ScheduledTask -TaskName 'PortfoyTakip-PortfolioSync-Every30m'
Start-ScheduledTask -TaskName 'PortfoyTakip-CryptoSync-Every5m'
Start-ScheduledTask -TaskName 'PortfoyTakip-AbdSync-Every10m'
```

## Durum kontrol

```powershell
Get-ScheduledTaskInfo -TaskName 'PortfoyTakip-PortfolioSync-Every30m'
Get-ScheduledTaskInfo -TaskName 'PortfoyTakip-CryptoSync-Every5m'
Get-ScheduledTaskInfo -TaskName 'PortfoyTakip-AbdSync-Every10m'
```

## Kaldirma

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\windows\register-local-price-sync-tasks.ps1 -Unregister
```

## Calistirilan scriptler

### Kripto (5 dk)

- `scripts/sync-crypto-prices.js` (CoinGecko; XAUT/PAXG emtia token)

Uretim karsiligi: GitHub `crypto-sync.yml` — `docs/SUPABASE-CRYPTO-SYNC.md`

### Portfolio (30 dk)

- `scripts/sync-bist-scrape.js`
- `scripts/sync-doviz-dev.js`
- `scripts/sync-emtia-scrape.js`
- `scripts/sync-kapalicarsi-gold.js`
- `scripts/sync-yurtdisi-prices.js --mode=holdings --batch=500 --delay=140`

(`price_history` snapshot devre disi — migration 021)

### ABD (10 dk)

- `scripts/sync-yurtdisi-list.js`
- `scripts/sync-yurtdisi-prices.js --mode=full --batch=500 --cycle-window=500 --cycle-every-min=10 --delay=180`
- `scripts/sync-yurtdisi-missing-prices.js --limit=160 --delay=140`

## Notlar

- Gorevler `Interactive` kaydolur; kullanici oturumu acikken calisir.
- Laptop pildeyken de calismasi icin gorev ayarlari acik birakildi.
- ABD gorevi bilerek `:05` fazinda baslatilir; Portfolio tetigiyle ayni dakikaya gelerek cakismasi azalir.
- Kripto gorevi `:02` fazinda baslar; ABD `:05` ile ayni anda calismasin diye.
