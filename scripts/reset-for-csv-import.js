/**
 * CSV’den sıfırdan yükleme öncesi temizlik:
 * 1) Verilen e-postadaki kullanıcının TÜM portföylerini siler
 *    → holdings + allocation_snapshots (CASCADE) gider.
 * 2) İsteğe bağlı: Bu kullanıcıya ait portfolio_uploads kayıtlarını siler.
 * 3) İsteğe bağlı --purge-master: Tüm holding kalmadıysa price_history truncate + tüm assets siler.
 *
 * UYARI: --purge-master sonrası CSV’deki semboller assets tablosunda olmalı; önce sync script’leri çalıştırın.
 *
 *   node scripts/reset-for-csv-import.js hasimozturk@gmail.com
 *   node scripts/reset-for-csv-import.js hasimozturk@gmail.com --purge-master
 */
const path = require('path');
const fs = require('fs');

function loadEnv() {
  const envPath = path.resolve(__dirname, '..', '.env');
  if (!fs.existsSync(envPath)) return;
  let c = fs.readFileSync(envPath, 'utf8');
  if (c.charCodeAt(0) === 0xfeff) c = c.slice(1);
  for (const line of c.split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Za-z0-9_]+)\s*=\s*(.*?)\s*$/);
    if (m) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '').trim();
  }
}

async function main() {
  loadEnv();
  const args = process.argv.slice(2).filter((a) => !a.startsWith('--'));
  const purgeMaster = process.argv.includes('--purge-master');
  const email = (args[0] || '').trim().toLowerCase();

  const url = process.env.EXPO_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    console.error('Eksik: EXPO_PUBLIC_SUPABASE_URL ve SUPABASE_SERVICE_ROLE_KEY');
    process.exit(1);
  }
  if (!email) {
    console.error('Kullanım: node scripts/reset-for-csv-import.js <email> [--purge-master]');
    process.exit(1);
  }

  const { createClient } = require('@supabase/supabase-js');
  const sb = createClient(url, key, { auth: { persistSession: false } });

  const { data: usersData, error: uerr } = await sb.auth.admin.listUsers({ page: 1, perPage: 1000 });
  if (uerr) throw uerr;
  const user = (usersData?.users || []).find((u) => (u.email || '').toLowerCase() === email);
  if (!user) {
    console.error('Auth’ta kullanıcı yok:', email);
    process.exit(1);
  }
  const userId = user.id;
  console.log('Kullanıcı:', email, userId);

  const { data: myPorts, error: pErr } = await sb.from('portfolios').select('id,name').eq('user_id', userId);
  if (pErr) throw pErr;
  console.log('Silinecek portföy sayısı:', myPorts?.length ?? 0);
  if (myPorts?.length) myPorts.forEach((p) => console.log('  -', p.name, p.id));

  const { error: delP } = await sb.from('portfolios').delete().eq('user_id', userId);
  if (delP) throw new Error('portfolios delete: ' + delP.message);
  console.log('Portföyler silindi (holdings / allocation_snapshots cascade).');

  const { count: upCount } = await sb
    .from('portfolio_uploads')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', userId);
  if (upCount && upCount > 0) {
    const { error: delU } = await sb.from('portfolio_uploads').delete().eq('user_id', userId);
    if (delU) console.warn('portfolio_uploads silinemedi:', delU.message);
    else console.log('portfolio_uploads temizlendi:', upCount, 'satır');
  }

  const { count: hLeft, error: hErr } = await sb.from('holdings').select('id', { count: 'exact', head: true });
  if (hErr) throw hErr;
  console.log('Kalan holding (tüm DB):', hLeft ?? 0);

  if (purgeMaster) {
    if ((hLeft ?? 0) > 0) {
      console.error(
        '\n--purge-master atlandı: Hâlâ başka holding var (başka kullanıcı veya yetişmemiş CASCADE).',
        'Tüm assets silmek için önce tüm portföylerdeki pozisyonlar kalkmalı.',
      );
      process.exit(1);
    }

    const { error: rpcErr } = await sb.rpc('truncate_price_history');
    if (rpcErr) {
      console.warn('truncate_price_history RPC yok/hata (009 migration?):', rpcErr.message);
      console.warn('price_history elle boşaltılmadı; assets silmeden önce gerekirse SQL ile truncate edin.');
    } else {
      console.log('price_history TRUNCATE tamam.');
    }

    const epoch = '1970-01-01T00:00:00.000Z';
    const { error: aErr } = await sb.from('assets').delete().gte('created_at', epoch);
    if (aErr) throw new Error('assets delete: ' + aErr.message);
    console.log('Tüm assets silindi.');
    console.log('\nSonraki adım: master listeyi doldurun, sonra CSV yükleyin:');
    console.log('  npm run sync-crypto');
    console.log('  (BIST / döviz / ABD / emtia için projedeki diğer sync script’leri)');
  } else {
    console.log('\nMaster assets korundu. CSV doğrudan eşleşen sembollerle çalışır.');
    console.log('Tüm varlık kataloğunu da silmek için aynı komutu --purge-master ile tekrar çalıştırın');
    console.log('(önce bu kullanıcı dışında holding kalmadığından emin olun).');
  }

  console.log('\nUygulama: ensure-portfolio ile boş portföy oluşturun, sonra CSV yükleyin:');
  console.log('  npm run ensure-portfolio --', email);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
