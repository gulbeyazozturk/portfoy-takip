const XLSX = require('xlsx');

/**
 * @param {{
 *   reportDate: string;
 *   usageIsSample: boolean;
 *   summary: { metric: string; value: string | number }[];
 *   users: object[];
 *   portfolios: object[];
 * }} data
 * @returns {Buffer}
 */
function buildReportXlsxBuffer(data) {
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
    [
      'E-posta',
      'Portföy sayısı',
      'Toplam varlık',
      'Giriş (oturum)',
      'Süre (dakika)',
      'Süre',
    ],
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

  return XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
}

function xlsxFilename(reportDate) {
  return `omnifolio-gunluk-rapor-${reportDate}.xlsx`;
}

module.exports = { buildReportXlsxBuffer, xlsxFilename };
