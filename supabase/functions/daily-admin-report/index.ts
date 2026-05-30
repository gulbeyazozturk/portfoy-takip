/**
 * Günlük admin raporu → hasimozturk@gmail.com (Resend).
 * Zamanlama: pg_cron → pg_net → POST + x-daily-report-cron
 *
 * Edge secrets: SERVICE_ROLE_KEY, DAILY_REPORT_CRON_SECRET, RESEND_API_KEY
 * Opsiyonel: RESEND_FROM (yoksa onboarding@resend.dev)
 */
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.1';

const REPORT_TO = 'hasimozturk@gmail.com';

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
  });
}

function istanbulTodayYmd(): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Istanbul',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
}

function formatDuration(totalSeconds: number): string {
  const s = Math.max(0, Number(totalSeconds) || 0);
  const m = Math.floor(s / 60);
  const r = s % 60;
  if (m >= 60) {
    const h = Math.floor(m / 60);
    const mm = m % 60;
    return `${h}s ${mm}dk`;
  }
  return `${m}dk ${r}sn`;
}

function sampleUsageForEmail(email: string, reportDate: string) {
  const seed = [...(email + reportDate)].reduce((a, c) => a + c.charCodeAt(0), 0);
  return {
    sessions: 1 + (seed % 4),
    totalSeconds: 90 + (seed % 7) * 120 + (1 + (seed % 4)) * 45,
  };
}

async function listAllUsers(sb: ReturnType<typeof createClient>) {
  const users: { id: string; email?: string }[] = [];
  let page = 1;
  while (true) {
    const { data, error } = await sb.auth.admin.listUsers({ page, perPage: 1000 });
    if (error) throw error;
    const batch = data?.users || [];
    users.push(...batch);
    if (batch.length < 1000) break;
    page += 1;
  }
  return users;
}

async function fetchPortfolioRows(sb: ReturnType<typeof createClient>) {
  const { data, error } = await sb
    .from('portfolios')
    .select('id, name, user_id')
    .not('user_id', 'is', null);
  if (error) throw error;
  const portfolios = data || [];
  const portfolioIds = portfolios.map((p) => p.id);
  const holdingsByPortfolio = new Map<string, number>();
  if (portfolioIds.length) {
    const { data: hData, error: hErr } = await sb
      .from('holdings')
      .select('id, portfolio_id')
      .in('portfolio_id', portfolioIds);
    if (hErr) throw hErr;
    for (const h of hData || []) {
      holdingsByPortfolio.set(h.portfolio_id, (holdingsByPortfolio.get(h.portfolio_id) || 0) + 1);
    }
  }
  return { portfolios, holdingsByPortfolio };
}

async function fetchUsageForDate(sb: ReturnType<typeof createClient>, reportDate: string) {
  const dayStart = `${reportDate}T00:00:00+03:00`;
  const dayEnd = `${reportDate}T23:59:59.999+03:00`;
  const { data, error } = await sb
    .from('app_usage_sessions')
    .select('user_id, started_at, ended_at, duration_seconds')
    .gte('started_at', dayStart)
    .lte('started_at', dayEnd);
  if (error) {
    const msg = error.message || '';
    if (/does not exist|schema cache/i.test(msg)) {
      return { rows: null as Map<string, { sessions: number; totalSeconds: number }> | null, missingTable: true };
    }
    throw error;
  }
  const byUser = new Map<string, { sessions: number; totalSeconds: number }>();
  for (const row of data || []) {
    const uid = row.user_id as string;
    let sec = row.duration_seconds as number | null;
    if (sec == null && row.started_at) {
      const end = row.ended_at ? new Date(row.ended_at as string) : new Date(row.started_at as string);
      sec = Math.max(0, Math.round((end.getTime() - new Date(row.started_at as string).getTime()) / 1000));
    }
    const cur = byUser.get(uid) || { sessions: 0, totalSeconds: 0 };
    cur.sessions += 1;
    cur.totalSeconds += sec || 0;
    byUser.set(uid, cur);
  }
  return { rows: byUser, missingTable: false };
}

function buildReportMarkdown(opts: {
  reportDate: string;
  users: { id: string; email?: string }[];
  portfolios: { id: string; name: string; user_id: string }[];
  holdingsByPortfolio: Map<string, number>;
  usageByUserId: Map<string, { sessions: number; totalSeconds: number }> | null;
  usageIsSample: boolean;
}): string {
  const { reportDate, users, portfolios, holdingsByPortfolio, usageByUserId, usageIsSample } = opts;
  const emailById = new Map(users.map((u) => [u.id, u.email || '(e-posta yok)']));
  const portfoliosByUser = new Map<string, { name: string; assetCount: number }[]>();
  for (const p of portfolios) {
    if (!portfoliosByUser.has(p.user_id)) portfoliosByUser.set(p.user_id, []);
    portfoliosByUser.get(p.user_id)!.push({
      name: p.name,
      assetCount: holdingsByPortfolio.get(p.id) || 0,
    });
  }

  const lines: string[] = [];
  lines.push(`# Günlük rapor — ${reportDate} (TSİ)`);
  lines.push('');
  lines.push('## Özet');
  lines.push('| Metrik | Değer |');
  lines.push('|--------|------:|');
  lines.push(`| Kayıtlı kullanıcı (auth) | ${users.length} |`);
  lines.push(`| Portföyü olan kullanıcı | ${portfoliosByUser.size} |`);
  lines.push(`| Toplam portföy | ${portfolios.length} |`);
  const totalHoldings = [...holdingsByPortfolio.values()].reduce((a, b) => a + b, 0);
  lines.push(`| Toplam varlık (holding) | ${totalHoldings} |`);
  if (usageIsSample) {
    lines.push('| Kullanım verisi | Örnek (app_usage_sessions yok/boş) |');
  } else {
    lines.push(`| Bugün oturum kaydı olan kullanıcı | ${usageByUserId?.size ?? 0} |`);
  }
  lines.push('');
  lines.push('## Kullanıcı detayı');
  lines.push('');
  lines.push(
    '| E-posta | Portföy | Varlık | Portföyler | Giriş | Süre |',
  );
  lines.push('|---------|--------:|-------:|------------|------:|------|');

  const sorted = [...users].sort((a, b) => (a.email || '').localeCompare(b.email || '', 'tr'));
  for (const u of sorted) {
    const email = emailById.get(u.id)!;
    const plist = portfoliosByUser.get(u.id) || [];
    const portfolioCount = plist.length;
    const totalAssets = plist.reduce((s, p) => s + p.assetCount, 0);
    const portfolioDetail =
      portfolioCount === 0 ? '—' : plist.map((p) => `${p.name} (${p.assetCount})`).join('; ');

    let sessions = 0;
    let totalSeconds = 0;
    if (usageByUserId?.has(u.id)) {
      const uu = usageByUserId.get(u.id)!;
      sessions = uu.sessions;
      totalSeconds = uu.totalSeconds;
    } else if (usageIsSample && portfolioCount > 0) {
      const sample = sampleUsageForEmail(email, reportDate);
      sessions = sample.sessions;
      totalSeconds = sample.totalSeconds;
    }

    const usageCol =
      portfolioCount === 0 && !usageByUserId?.has(u.id) ? '—' : String(sessions);
    const durationCol =
      portfolioCount === 0 && !usageByUserId?.has(u.id)
        ? '—'
        : formatDuration(totalSeconds);

    lines.push(
      `| ${email} | ${portfolioCount} | ${totalAssets} | ${portfolioDetail} | ${usageCol} | ${durationCol} |`,
    );
  }

  if (usageIsSample) {
    lines.push('');
    lines.push('_Kullanım: app_usage_sessions migration + istemci kaydı gerekir._');
  }

  return lines.join('\n');
}

async function sendResendEmail(subject: string, text: string) {
  const apiKey = (Deno.env.get('RESEND_API_KEY') || '').trim();
  if (!apiKey) {
    return { ok: false, status: 0, body: 'RESEND_API_KEY_edge_secret_missing' };
  }
  const from = (Deno.env.get('RESEND_FROM') || 'Omnifolio <onboarding@resend.dev>').trim();
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from,
      to: [REPORT_TO],
      subject,
      text,
    }),
  });
  const body = await res.text();
  return { ok: res.ok, status: res.status, body: body.slice(0, 500) };
}

Deno.serve(async (req: Request) => {
  if (req.method !== 'POST' && req.method !== 'GET') {
    return json({ error: 'method_not_allowed' }, 405);
  }

  const expected = (Deno.env.get('DAILY_REPORT_CRON_SECRET') || '').trim();
  const got = (req.headers.get('x-daily-report-cron') || '').trim();
  if (!expected) {
    return json({ error: 'unauthorized', reason: 'DAILY_REPORT_CRON_SECRET_missing' }, 401);
  }
  if (got !== expected) {
    return json({ error: 'unauthorized', reason: 'x_daily_report_cron_mismatch' }, 401);
  }

  const serviceKey =
    (Deno.env.get('SERVICE_ROLE_KEY') || Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '').trim();
  const supabaseUrl = (Deno.env.get('SUPABASE_URL') || '').trim();
  if (!serviceKey || !supabaseUrl) {
    return json({ error: 'missing_service_role_or_url' }, 500);
  }

  try {
    const reportDate = istanbulTodayYmd();
    const sb = createClient(supabaseUrl, serviceKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const users = await listAllUsers(sb);
    const { portfolios, holdingsByPortfolio } = await fetchPortfolioRows(sb);

    const usage = await fetchUsageForDate(sb, reportDate);
    const usageIsSample = usage.missingTable || !usage.rows || usage.rows.size === 0;

    const markdown = buildReportMarkdown({
      reportDate,
      users,
      portfolios,
      holdingsByPortfolio,
      usageByUserId: usage.rows,
      usageIsSample,
    });

    const subject = `Omnifolio günlük rapor — ${reportDate} (TSİ)`;
    const mail = await sendResendEmail(subject, markdown);
    if (!mail.ok) {
      return json(
        {
          ok: false,
          reportDate,
          to: REPORT_TO,
          email_error: mail.body,
          email_http: mail.status,
          hint:
            'Supabase Edge secrets: RESEND_API_KEY (resend.com → API Keys). Ücretsiz hesapta onboarding@resend.dev yalnızca kayıt e-postasına gönderir.',
          report_preview_lines: markdown.split('\n').slice(0, 12),
        },
        502,
      );
    }

    return json({
      ok: true,
      reportDate,
      to: REPORT_TO,
      email_http: mail.status,
      users: users.length,
      usage_is_sample: usageIsSample,
    });
  } catch (e) {
    console.error(e);
    const msg = e instanceof Error ? e.message : String(e);
    return json({ ok: false, error: msg }, 500);
  }
});
