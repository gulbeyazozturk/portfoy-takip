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
      'Toplam değer (TRY)',
      'Toplam değer (USD)',
      'Giriş (oturum)',
      'Süre (dakika)',
      'Süre',
    ],
    ...data.users.map((u) => [
      u.email,
      u.portfolioCount,
      u.totalAssets,
      u.totalValueTL ?? '—',
      u.totalValueUSD ?? '—',
      u.sessions,
      u.durationMinutes,
      u.durationLabel,
    ]),
  ];
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(kullanicilar), 'Kullanıcılar');

  const portfoyler = [
    [
      'E-posta',
      'Portföy adı',
      'Portföy para birimi',
      'Varlık sayısı',
      'Toplam değer (TRY)',
      'Toplam değer (USD)',
    ],
    ...data.portfolios.map((p) => [
      p.email,
      p.portfolioName,
      p.portfolioCurrency ?? '—',
      p.assetCount,
      p.totalValueTL ?? '—',
      p.totalValueUSD ?? '—',
    ]),
  ];
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(portfoyler), 'Portföyler');

  const varliklar = [
    [
      'E-posta',
      'Portföy',
      'Kategori',
      'Sembol',
      'Varlık adı',
      'Adet / miktar',
      'Birim fiyat',
      'Fiyat birimi',
      'Fiyat kaynağı',
      'Toplam değer (TRY)',
      'Toplam değer (USD)',
    ],
    ...(data.assets || []).map((a) => [
      a.email,
      a.portfolioName,
      a.category,
      a.symbol,
      a.assetName,
      a.quantity,
      a.unitPrice ?? '',
      a.unitCurrency,
      a.priceSource,
      a.valueTL ?? '',
      a.valueUSD ?? '',
    ]),
  ];
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(varliklar), 'Varlıklar');

  return XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
}

function xlsxFilename(reportDate) {
  return `omnifolio-gunluk-rapor-${reportDate}.xlsx`;
}

module.exports = { buildReportXlsxBuffer, xlsxFilename };
