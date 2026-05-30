/**
 * Günlük admin raporu → Excel eki + kısa özet (hasimozturk@gmail.com, Resend).
 */
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.1';
import {
  buildEmailPlainText,
  buildReportData,
  buildXlsxBase64,
  xlsxFilename,
} from './report.ts';

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

async function sendResendEmail(subject: string, text: string, xlsxBase64: string, filename: string) {
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
      attachments: [{ filename, content: xlsxBase64 }],
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

    const data = buildReportData({
      reportDate,
      users,
      portfolios,
      holdingsByPortfolio,
      usageByUserId: usage.rows,
      usageIsSample,
    });

    const filename = xlsxFilename(reportDate);
    const xlsxBase64 = buildXlsxBase64(data);
    const emailText = buildEmailPlainText(data);
    const subject = `Omnifolio günlük rapor — ${reportDate} (TSİ)`;

    const mail = await sendResendEmail(subject, emailText, xlsxBase64, filename);
    if (!mail.ok) {
      return json(
        {
          ok: false,
          reportDate,
          to: REPORT_TO,
          attachment: filename,
          email_error: mail.body,
          email_http: mail.status,
        },
        502,
      );
    }

    return json({
      ok: true,
      reportDate,
      to: REPORT_TO,
      attachment: filename,
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
