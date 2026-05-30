/**
 * Günlük admin raporu (service role).
 *
 *   node scripts/daily-admin-report.js
 *   node scripts/daily-admin-report.js 2026-05-30
 *   node scripts/daily-admin-report.js --sample
 */
const { loadEnv } = require('./lib/load-env');
const { generateDailyAdminReport } = require('./lib/daily-admin-report-core');

async function main() {
  loadEnv();
  const args = process.argv.slice(2).filter(Boolean);
  const forceSample = args.includes('--sample');
  const reportDate = args.find((a) => /^\d{4}-\d{2}-\d{2}$/.test(a));

  const { markdown } = await generateDailyAdminReport({ reportDate, forceSample });
  console.log(markdown);
}

main().catch((e) => {
  console.error(e.message || e);
  process.exit(1);
});
