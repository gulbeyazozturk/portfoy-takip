function istanbulTodayYmd() {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Istanbul',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
}

function formatDuration(totalSeconds) {
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

function durationMinutes(totalSeconds) {
  return Math.round((Math.max(0, Number(totalSeconds) || 0) / 60) * 10) / 10;
}

function sampleUsageForEmail(email, reportDate) {
  const seed = [...(email + reportDate)].reduce((a, c) => a + c.charCodeAt(0), 0);
  const sessions = 1 + (seed % 4);
  const totalSeconds = 90 + (seed % 7) * 120 + sessions * 45;
  return { sessions, totalSeconds };
}

async function listAllUsers(sb) {
  const users = [];
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

async function fetchPortfolioRows(sb) {
  const { data, error } = await sb
    .from('portfolios')
    .select('id, name, user_id')
    .not('user_id', 'is', null);
  if (error) throw error;
  const portfolioIds = (data || []).map((p) => p.id);
  let holdings = [];
  if (portfolioIds.length) {
    const { data: hData, error: hErr } = await sb
      .from('holdings')
      .select('id, portfolio_id')
      .in('portfolio_id', portfolioIds);
    if (hErr) throw hErr;
    holdings = hData || [];
  }
  const holdingsByPortfolio = new Map();
  for (const h of holdings) {
    holdingsByPortfolio.set(h.portfolio_id, (holdingsByPortfolio.get(h.portfolio_id) || 0) + 1);
  }
  return { portfolios: data || [], holdingsByPortfolio };
}

async function fetchUsageForDate(sb, reportDate) {
  const dayStart = `${reportDate}T00:00:00+03:00`;
  const dayEnd = `${reportDate}T23:59:59.999+03:00`;
  const { data, error } = await sb
    .from('app_usage_sessions')
    .select('user_id, started_at, ended_at, duration_seconds')
    .gte('started_at', dayStart)
    .lte('started_at', dayEnd);
  if (error) {
    const msg = error.message || '';
    if (
      error.code === '42P01' ||
      error.code === 'PGRST205' ||
      /does not exist/i.test(msg) ||
      /could not find the table/i.test(msg)
    ) {
      return { rows: null, missingTable: true };
    }
    throw error;
  }
  const byUser = new Map();
  for (const row of data || []) {
    const uid = row.user_id;
    let sec = row.duration_seconds;
    if (sec == null && row.started_at) {
      const end = row.ended_at ? new Date(row.ended_at) : new Date(row.started_at);
      sec = Math.max(0, Math.round((end - new Date(row.started_at)) / 1000));
    }
    const cur = byUser.get(uid) || { sessions: 0, totalSeconds: 0 };
    cur.sessions += 1;
    cur.totalSeconds += sec || 0;
    byUser.set(uid, cur);
  }
  return { rows: byUser, missingTable: false };
}

/**
 * @returns {{
 *   reportDate: string;
 *   usageIsSample: boolean;
 *   summary: { metric: string; value: string | number }[];
 *   users: { email: string; portfolioCount: number; totalAssets: number; sessions: string | number; durationMinutes: string | number; durationLabel: string }[];
 *   portfolios: { email: string; portfolioName: string; assetCount: number }[];
 * }}
 */
function buildReportData({ reportDate, users, portfolios, holdingsByPortfolio, usageByUserId, usageIsSample }) {
  const emailById = new Map(users.map((u) => [u.id, u.email || '(e-posta yok)']));

  const portfoliosByUser = new Map();
  for (const p of portfolios) {
    if (!portfoliosByUser.has(p.user_id)) portfoliosByUser.set(p.user_id, []);
    portfoliosByUser.get(p.user_id).push({
      name: p.name,
      assetCount: holdingsByPortfolio.get(p.id) || 0,
    });
  }

  const totalHoldings = [...holdingsByPortfolio.values()].reduce((a, b) => a + b, 0);
  const summary = [
    { metric: 'Rapor tarihi (TSİ)', value: reportDate },
    { metric: 'Kayıtlı kullanıcı (auth)', value: users.length },
    { metric: 'Portföyü olan kullanıcı', value: portfoliosByUser.size },
    { metric: 'Toplam portföy', value: portfolios.length },
    { metric: 'Toplam varlık (holding)', value: totalHoldings },
  ];
  if (usageIsSample) {
    summary.push({ metric: 'Kullanım verisi', value: 'Örnek (app_usage_sessions yok/boş)' });
  } else {
    summary.push({
      metric: 'Bugün oturum kaydı olan kullanıcı',
      value: usageByUserId ? usageByUserId.size : 0,
    });
  }

  const userRows = [];
  const portfolioRows = [];

  const sortedUsers = [...users].sort((a, b) =>
    (a.email || '').localeCompare(b.email || '', 'tr'),
  );

  for (const u of sortedUsers) {
    const email = emailById.get(u.id);
    const plist = portfoliosByUser.get(u.id) || [];
    const portfolioCount = plist.length;
    const totalAssets = plist.reduce((s, p) => s + p.assetCount, 0);

    let sessions = 0;
    let totalSeconds = 0;
    if (usageByUserId && usageByUserId.has(u.id)) {
      const uu = usageByUserId.get(u.id);
      sessions = uu.sessions;
      totalSeconds = uu.totalSeconds;
    } else if (usageIsSample && portfolioCount > 0) {
      const sample = sampleUsageForEmail(email, reportDate);
      sessions = sample.sessions;
      totalSeconds = sample.totalSeconds;
    }

    const hasUsage = usageByUserId?.has(u.id) || (usageIsSample && portfolioCount > 0);
    userRows.push({
      email,
      portfolioCount,
      totalAssets,
      sessions: hasUsage ? sessions : '—',
      durationMinutes: hasUsage ? durationMinutes(totalSeconds) : '—',
      durationLabel: hasUsage ? formatDuration(totalSeconds) : '—',
    });

    for (const p of plist) {
      portfolioRows.push({
        email,
        portfolioName: p.name,
        assetCount: p.assetCount,
      });
    }
    if (plist.length === 0) {
      portfolioRows.push({ email, portfolioName: '—', assetCount: 0 });
    }
  }

  portfolioRows.sort((a, b) =>
    a.email.localeCompare(b.email, 'tr') || a.portfolioName.localeCompare(b.portfolioName, 'tr'),
  );

  return {
    reportDate,
    usageIsSample,
    summary,
    users: userRows,
    portfolios: portfolioRows,
  };
}

function buildEmailPlainText(data) {
  const lines = [
    `Omnifolio günlük rapor — ${data.reportDate} (TSİ)`,
    '',
    'Özet:',
    ...data.summary.map((r) => `- ${r.metric}: ${r.value}`),
    '',
    `Kullanıcı satırı: ${data.users.length}`,
    `Portföy satırı: ${data.portfolios.length}`,
    '',
    'Ayrıntılı tablolar ekteki Excel dosyasında (Özet, Kullanıcılar, Portföyler sayfaları).',
  ];
  if (data.usageIsSample) {
    lines.push('', 'Not: Kullanım sütunları örnek veridir.');
  }
  return lines.join('\n');
}

function buildReportMarkdown(data) {
  const lines = [`# Günlük rapor — ${data.reportDate} (TSİ)`, '', '## Özet', '| Metrik | Değer |', '|--------|------:|'];
  for (const r of data.summary) {
    lines.push(`| ${r.metric} | ${r.value} |`);
  }
  lines.push('', '_Tam tablo için ekteki Excel dosyasına bakın._');
  return lines.join('\n');
}

async function fetchReportInputs(sb, reportDate, forceSample) {
  const users = await listAllUsers(sb);
  const { portfolios, holdingsByPortfolio } = await fetchPortfolioRows(sb);

  let usageByUserId = null;
  let usageIsSample = forceSample;

  if (!forceSample) {
    const usage = await fetchUsageForDate(sb, reportDate);
    if (usage.missingTable || !usage.rows || usage.rows.size === 0) {
      usageIsSample = true;
      usageByUserId = null;
    } else {
      usageByUserId = usage.rows;
    }
  }

  return { users, portfolios, holdingsByPortfolio, usageByUserId, usageIsSample };
}

/**
 * @param {{ reportDate?: string, forceSample?: boolean, supabaseUrl?: string, serviceRoleKey?: string }} opts
 */
async function generateDailyAdminReport(opts = {}) {
  const reportDate = opts.reportDate || istanbulTodayYmd();
  const forceSample = Boolean(opts.forceSample);
  const url = opts.supabaseUrl || process.env.EXPO_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
  const key = opts.serviceRoleKey || process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error('Eksik: EXPO_PUBLIC_SUPABASE_URL ve SUPABASE_SERVICE_ROLE_KEY');
  }

  const { createClient } = require('@supabase/supabase-js');
  const sb = createClient(url, key, { auth: { persistSession: false } });

  const inputs = await fetchReportInputs(sb, reportDate, forceSample);
  const data = buildReportData({ reportDate, ...inputs });
  const { buildReportXlsxBuffer, xlsxFilename } = require('./daily-admin-report-xlsx');

  return {
    reportDate,
    usageIsSample: data.usageIsSample,
    data,
    markdown: buildReportMarkdown(data),
    emailText: buildEmailPlainText(data),
    xlsxBuffer: buildReportXlsxBuffer(data),
    xlsxFilename: xlsxFilename(reportDate),
  };
}

module.exports = {
  istanbulTodayYmd,
  buildReportData,
  buildEmailPlainText,
  generateDailyAdminReport,
};
