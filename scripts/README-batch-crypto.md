# Kripto fiyat + ikon batch (günde 1 defa)

## Ne yapar?

- `assets` tablosunda **category_id = 'kripto'** olan tüm varlıkların sembollerini alır.
- **CoinGecko** ücretsiz API’den güncel fiyat ve ikon URL’lerini çeker.
- Supabase `assets` satırlarını **current_price**, **icon_url**, **external_id**, **price_updated_at** ile günceller.

## 1. Migration (bir kez)

Supabase Dashboard → SQL Editor’da şu dosyayı çalıştır:

- `database/migrations/001_asset_price_and_icon.sql`

Böylece `assets` tablosuna gerekli sütunlar eklenir.

## 2. Çalıştırma

Proje kökünde `.env` içinde şunlar olmalı:

- `EXPO_PUBLIC_SUPABASE_URL`
- `EXPO_PUBLIC_SUPABASE_ANON_KEY`  
  (RLS kapalıysa anon yeter. Yazma engelliyorsa `SUPABASE_SERVICE_ROLE_KEY` kullan.)

Tek seferlik test:

```bash
npm run sync-crypto
```

## 3. Günde 1 defa çalıştırma

- **Windows:** Görev Zamanlayıcı ile günde bir saatte `npm run sync-crypto` (veya `node scripts/sync-crypto-prices.js`) çalışacak görev ekle; başlangıç dizini proje kökü olsun.
- **macOS/Linux:** `crontab -e` ile örnek:  
  `0 9 * * * cd /path/to/portfoy-takip && npm run sync-crypto`
- **GitHub Actions:** `.github/workflows/sync-crypto.yml` ile günde bir job tanımlayıp Supabase env’i secret olarak verip aynı script’i çalıştırabilirsin.

## Veri kaynağı

- **CoinGecko** ücretsiz API: `https://api.coingecko.com/api/v3/coins/markets`  
  API anahtarı gerekmez; rate limit’e dikkat (günde 1 çağrı yeter).
