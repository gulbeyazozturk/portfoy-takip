/**
 * GitHub Actions **Crypto sync** (`crypto-sync.yml`) için `workflow_dispatch`.
 *
 * Secrets: GITHUB_DISPATCH_PAT, GITHUB_DISPATCH_REPO
 * Cron: CRYPTO_CRON_SECRET varsa o, yoksa PORTFOLIO_CRON_SECRET
 * Header: x-crypto-cron
 */
function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
  });
}

function cronSecret(): string {
  return (Deno.env.get('CRYPTO_CRON_SECRET') || Deno.env.get('PORTFOLIO_CRON_SECRET') || '').trim();
}

async function dispatchCryptoWorkflow(): Promise<{ ok: boolean; status: number; body: string | null }> {
  const pat = (Deno.env.get('GITHUB_DISPATCH_PAT') || '').trim();
  const repo = (Deno.env.get('GITHUB_DISPATCH_REPO') || '').trim();
  if (!pat || !repo) {
    return { ok: false, status: 0, body: 'missing GITHUB_DISPATCH_PAT or GITHUB_DISPATCH_REPO' };
  }
  const ref = (Deno.env.get('GITHUB_DISPATCH_REF') || 'main').trim() || 'main';
  const res = await fetch(
    `https://api.github.com/repos/${repo}/actions/workflows/crypto-sync.yml/dispatches`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${pat}`,
        Accept: 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28',
        'User-Agent': 'supabase-edge-dispatch-crypto-sync',
      },
      body: JSON.stringify({ ref }),
    },
  );
  const body = res.ok ? null : await res.text();
  return { ok: res.ok, status: res.status, body: body?.slice(0, 400) ?? null };
}

Deno.serve(async (req: Request) => {
  if (req.method !== 'POST' && req.method !== 'GET') {
    return json({ error: 'method_not_allowed' }, 405);
  }

  const expected = cronSecret();
  const got = (req.headers.get('x-crypto-cron') || '').trim();
  if (!expected) {
    return json(
      { error: 'unauthorized', reason: 'CRYPTO_CRON_SECRET_or_PORTFOLIO_CRON_SECRET_edge_secret_missing' },
      401,
    );
  }
  if (got !== expected) {
    return json({ error: 'unauthorized', reason: 'x_crypto_cron_mismatch' }, 401);
  }

  try {
    const gh = await dispatchCryptoWorkflow();
    return json(
      {
        ok: gh.ok,
        mode: 'github_dispatch',
        workflow: 'crypto-sync.yml',
        github_http: gh.status,
        github_body: gh.body,
        hint: gh.ok
          ? 'GitHub Actions Crypto sync kuyruğa alındı (birkaç dk içinde çalışır).'
          : 'PAT yetkisi (repo + workflow) veya repo adını kontrol et. Workflow main’de olmalı.',
      },
      gh.ok ? 200 : 502,
    );
  } catch (e) {
    console.error(e);
    const msg = e instanceof Error ? e.message : String(e);
    return json({ ok: false, error: msg }, 500);
  }
});
