/**
 * Günlük admin raporu → Excel eki + kısa özet metni (SMTP veya yerel test).
 */
const { loadEnv } = require('./lib/load-env');
const { generateDailyAdminReport } = require('./lib/daily-admin-report-core');
const fs = require('fs');
const path = require('path');

function parseRecipients(raw) {
  return String(raw || '')
    .split(/[,;]/)
    .map((s) => s.trim())
    .filter(Boolean);
}

function requireSmtpConfig() {
  const host = process.env.SMTP_HOST;
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;
  const port = Number(process.env.SMTP_PORT || 587);
  const to = parseRecipients(process.env.DAILY_REPORT_TO || 'hasimozturk@gmail.com');
  if (!host || !user || !pass) {
    throw new Error('Eksik SMTP: SMTP_HOST, SMTP_USER, SMTP_PASS');
  }
  if (!to.length) {
    throw new Error('Eksik alıcı: DAILY_REPORT_TO');
  }
  return {
    host,
    port,
    secure: port === 465,
    auth: { user, pass },
    from: process.env.SMTP_FROM || user,
    to,
  };
}

async function sendReportEmail({ subject, text, xlsxBuffer, xlsxFilename }) {
  const nodemailer = require('nodemailer');
  const cfg = requireSmtpConfig();
  const transporter = nodemailer.createTransport({
    host: cfg.host,
    port: cfg.port,
    secure: cfg.secure,
    auth: cfg.auth,
  });
  await transporter.sendMail({
    from: cfg.from,
    to: cfg.to.join(', '),
    subject,
    text,
    attachments: [
      {
        filename: xlsxFilename,
        content: xlsxBuffer,
        contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      },
    ],
  });
  return cfg.to;
}

async function sendViaResend({ subject, text, xlsxBuffer, xlsxFilename }) {
  const apiKey = (process.env.RESEND_API_KEY || '').trim();
  if (!apiKey) throw new Error('RESEND_API_KEY eksik (.env)');
  const from = (process.env.RESEND_FROM || 'Omnifolio <onboarding@resend.dev>').trim();
  const to = parseRecipients(process.env.DAILY_REPORT_TO || 'hasimozturk@gmail.com');
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from,
      to,
      subject,
      text,
      attachments: [
        {
          filename: xlsxFilename,
          content: xlsxBuffer.toString('base64'),
        },
      ],
    }),
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Resend ${res.status}: ${body.slice(0, 400)}`);
  }
  return to;
}

async function main() {
  loadEnv();
  const dryRun = process.argv.includes('--dry-run');
  const saveOnly = process.argv.includes('--save-xlsx');
  const args = process.argv.slice(2).filter((a) => !a.startsWith('--'));
  const reportDate = args.find((a) => /^\d{4}-\d{2}-\d{2}$/.test(a));

  const report = await generateDailyAdminReport({ reportDate });
  const subject = `Omnifolio günlük rapor — ${report.reportDate} (TSİ)`;

  if (saveOnly) {
    const out = path.resolve(process.cwd(), report.xlsxFilename);
    fs.writeFileSync(out, report.xlsxBuffer);
    console.log('Kaydedildi:', out);
    return;
  }

  if (dryRun) {
    console.log('--- dry-run ---');
    console.log('Konu:', subject);
    console.log('Dosya:', report.xlsxFilename, `(${report.xlsxBuffer.length} byte)`);
    console.log('');
    console.log(report.emailText);
    return;
  }

  const hasSmtp = process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS;
  const recipients = hasSmtp
    ? await sendReportEmail({
        subject,
        text: report.emailText,
        xlsxBuffer: report.xlsxBuffer,
        xlsxFilename: report.xlsxFilename,
      })
    : await sendViaResend({
        subject,
        text: report.emailText,
        xlsxBuffer: report.xlsxBuffer,
        xlsxFilename: report.xlsxFilename,
      });

  console.log(`Gönderildi (${hasSmtp ? 'SMTP' : 'Resend'}): ${recipients.join(', ')}`);
  console.log('Ek:', report.xlsxFilename);
}

main().catch((e) => {
  console.error(e.message || e);
  process.exit(1);
});
