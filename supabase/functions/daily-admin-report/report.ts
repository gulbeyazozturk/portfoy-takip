import * as XLSX from 'https://esm.sh/xlsx@0.18.5';

export type ReportData = {
  reportDate: string;
  usageIsSample: boolean;
  summary: { metric: string; value: string | number }[];
  users: {
    email: string;
    portfolioCount: number;
    totalAssets: number;
    sessions: string | number;
    durationMinutes: string | number;
    durationLabel: string;
  }[];
  portfolios: { email: string; portfolioName: string; assetCount: number }[];
};

export function formatDuration(totalSeconds: number): string {
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

function durationMinutes(totalSeconds: number): number {
  return Math.round((Math.max(0, totalSeconds) / 60) * 10) / 10;
}

export function sampleUsageForEmail(email: string, reportDate: string) {
  const seed = [...(email + reportDate)].reduce((a, c) => a + c.charCodeAt(0), 0);
  const sessions = 1 + (seed % 4);
  const totalSeconds = 90 + (seed % 7) * 120 + sessions * 45;
  return { sessions, totalSeconds };
}

export function buildReportData(opts: {
  reportDate: string;
  users: { id: string; email?: string }[];
  portfolios: { id: string; name: string; user_id: string }[];
  holdingsByPortfolio: Map<string, number>;
  usageByUserId: Map<string, { sessions: number; totalSeconds: number }> | null;
  usageIsSample: boolean;
}): ReportData {
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

  const totalHoldings = [...holdingsByPortfolio.values()].reduce((a, b) => a + b, 0);
  const summary: ReportData['summary'] = [
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

  const userRows: ReportData['users'] = [];
  const portfolioRows: ReportData['portfolios'] = [];

  const sortedUsers = [...users].sort((a, b) =>
    (a.email || '').localeCompare(b.email || '', 'tr'),
  );

  for (const u of sortedUsers) {
    const email = emailById.get(u.id)!;
    const plist = portfoliosByUser.get(u.id) || [];
    const portfolioCount = plist.length;
    const totalAssets = plist.reduce((s, p) => s + p.assetCount, 0);

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
      portfolioRows.push({ email, portfolioName: p.name, assetCount: p.assetCount });
    }
    if (plist.length === 0) {
      portfolioRows.push({ email, portfolioName: '—', assetCount: 0 });
    }
  }

  portfolioRows.sort(
    (a, b) =>
      a.email.localeCompare(b.email, 'tr') ||
      a.portfolioName.localeCompare(b.portfolioName, 'tr'),
  );

  return { reportDate, usageIsSample, summary, users: userRows, portfolios: portfolioRows };
}

export function buildEmailPlainText(data: ReportData): string {
  const lines = [
    `Omnifolio günlük rapor — ${data.reportDate} (TSİ)`,
    '',
    'Özet:',
    ...data.summary.map((r) => `- ${r.metric}: ${r.value}`),
    '',
    `Kullanıcı satırı: ${data.users.length}`,
    `Portföy satırı: ${data.portfolios.length}`,
    '',
    'Ayrıntılı tablolar ekteki Excel dosyasında (Özet, Kullanıcılar, Portföyler).',
  ];
  if (data.usageIsSample) lines.push('', 'Not: Kullanım sütunları örnek veridir.');
  return lines.join('\n');
}

export function xlsxFilename(reportDate: string): string {
  return `omnifolio-gunluk-rapor-${reportDate}.xlsx`;
}

export function buildXlsxBase64(data: ReportData): string {
  const wb = XLSX.utils.book_new();

  const ozet = [
    ['Metrik', 'Değer'],
    ...data.summary.map((r) => [r.metric, r.value]),
  ];
  if (data.usageIsSample) {
    ozet.push(['Not', 'Kullanım sütunları örnek (app_usage_sessions yok/boş)']);
  }
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(ozet), 'Özet');

  const kullanicilar = [
    ['E-posta', 'Portföy sayısı', 'Toplam varlık', 'Giriş (oturum)', 'Süre (dakika)', 'Süre'],
    ...data.users.map((u) => [
      u.email,
      u.portfolioCount,
      u.totalAssets,
      u.sessions,
      u.durationMinutes,
      u.durationLabel,
    ]),
  ];
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(kullanicilar), 'Kullanıcılar');

  const portfoyler = [
    ['E-posta', 'Portföy adı', 'Varlık sayısı'],
    ...data.portfolios.map((p) => [p.email, p.portfolioName, p.assetCount]),
  ];
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(portfoyler), 'Portföyler');

  const bytes = XLSX.write(wb, { type: 'array', bookType: 'xlsx' }) as ArrayBuffer;
  const u8 = new Uint8Array(bytes);
  let bin = '';
  for (let i = 0; i < u8.length; i++) bin += String.fromCharCode(u8[i]);
  return btoa(bin);
}
