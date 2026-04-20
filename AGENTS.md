# Agent / geliştirici notları (portfoy-takip)

Bu dosya Cursor ve benzeri araçlar için **proje özgü** kısa kurallar içerir. Genel kodlama tercihleri kullanıcı ayarlarında kalır.

## Stack
- **Expo SDK 54** + **expo-router**, **Supabase** (auth + Postgres + RLS), **EAS** ile iOS/Android build.
- Ortam: `.env` içinde `EXPO_PUBLIC_SUPABASE_*`; script’ler için ayrıca `SUPABASE_SERVICE_ROLE_KEY`.

## Portföy ve auth
- Seçili portföy: `context/portfolio.tsx` — `refresh()` boş listede **Ana Portföy** oluşturur; toplu yüklemede `price_updated_at` / oturum uyumu önemli.
- Yeni kullanıcıda varsayılan portföy: `database/migrations/011_new_user_default_portfolio.sql` (Supabase’e uygulanmalı).
- Portföy adı eşlemesi: `lib/portfolio-name-loose.ts`, TEFAS hata kodu **-100**: `lib/fon-price-guards.ts` + `scripts/sync-tefas-funds.js`.

## Günlük % ve saat dilimi
- UI’da gösterilen günlük değişim: `lib/effective-change-24h.ts` — **BIST / fon / emtia / döviz / mevduat** → takvim **Europe/Istanbul**; **yurtdışı hisse** → **America/New_York** (NYSE kapanışı kabaca 23:00–00:00 TSİ aralığında, ABD yaz/kışına göre değişir).
- **Emtia** sunucu tarafı gece referansı: `scripts/emtia-midnight-tr.js` + `sync-emtia-scrape.js` / `sync-kapalicarsi-gold.js`.
- Gece yarısı geçişinde ekranın yenilenmesi: `hooks/use-minute-tick.ts`.

## Sync ve script’ler
- Node script’leri `scripts/` altında; fonksiyonel isimler (`sync-tefas-funds.js`, `reset-for-csv-import.js`, vb.).
- TEFAS (GitHub Actions IP engeli): üretimde `supabase/functions/sync-tefas` + `docs/SUPABASE-TEFAS-EDGE.md` (pg_cron + pg_net). Yerel Windows zamanlama (ör. 07:30–12:30): `scripts/windows/register-tefas-morning-task.ps1` + `docs/LOCAL-TEFAS-WINDOWS-SCHEDULE.md`.
- ABD (yurtdışı) fiyatları: Yahoo GitHub runner’da (`us-sync.yml`); periyot **Supabase** `pg_cron` → Edge `sync-abd-prices` (`github_dispatch`). GitHub’da `schedule` yok: `docs/SUPABASE-ABD-SYNC.md`.
- **Portfolio sync** (kripto/BIST/döviz/emtıa/holdings yurtdışı/snapshot): `portfolio-sync.yml`; periyot **Supabase** `pg_cron` → Edge `dispatch-portfolio-sync`: `docs/SUPABASE-PORTFOLIO-SYNC.md`.
- Kullanıcı verisini silme/temizlik: `reset-for-csv-import.js` (master `assets` silmez); tam kullanıcı silme: `delete-user-by-email.js`.

## Veritabanı
- Şemalar: `database/migrations/`, özet: `scripts/init-db.sql`.
- RLS değişikliklerinde istemci + service role davranışını ayrı düşün.

## Bitirmeden önce
- Mümkünse `npx tsc --noEmit`; davranış değiştiyse ilgili ekran veya script akışını gözden geçir.
- Kapsamı gereksiz büyütme; aynı mantığı tekrar etme — ortak `lib/` veya mevcut hook’ları genişlet.
