# Kripto fiyat + ikon batch

## Ne yapar?

- CoinGecko’dan top coin listesini çeker (kripto: USD, XAUT/PAXG: TRY emtia).
- **Kripto:** `category_id = 'kripto'` UPSERT (XAUT, PAXG bu grupta tutulmaz).
- **Emtia:** XAUT ve PAXG CoinGecko ile UPSERT.

## Üretim zamanlama

Bağımsız GitHub işi: `.github/workflows/crypto-sync.yml` — **~5 dakikada bir** (Supabase `pg_cron` → Edge `dispatch-crypto-sync`). Genel `portfolio-sync.yml` bu script’i çalıştırmaz.

Kurulum: `docs/SUPABASE-CRYPTO-SYNC.md`

## Manuel

`.env`: `EXPO_PUBLIC_SUPABASE_URL` ve `EXPO_PUBLIC_SUPABASE_ANON_KEY` (yazma için `SUPABASE_SERVICE_ROLE_KEY`).

```bash
npm run sync-crypto
```

Yerel Windows 5 dk görev: `docs/LOCAL-WINDOWS-PRICE-SCHEDULE.md`

## Veri kaynağı

- **CoinGecko** ücretsiz (keyless) API: `https://api.coingecko.com/api/v3/coins/markets`
- Rate limit: sayfalar arası ~2 sn; 429 olursa tur başarısız, bir sonraki 5 dk denemesi.
