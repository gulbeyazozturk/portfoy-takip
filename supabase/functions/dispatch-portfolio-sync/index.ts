/**
 * GitHub Actions **Portfolio sync** (`portfolio-sync.yml`) için `workflow_dispatch`.
 *
 * Secrets: PORTFOLIO_CRON_SECRET, GITHUB_DISPATCH_PAT, GITHUB_DISPATCH_REPO
 * (PAT/repo, ABD Edge ile aynı olabilir.)
 * Header: x-portfolio-cron: <PORTFOLIO_CRON_SECRET>
 */
function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
  });
}

async function dispatchPortfolioWorkflow(): Promise<{ ok: boolean; status: number; body: string | null }> {
  const pat = (Deno.env.get('GITHUB_DISPATCH_PAT') || '').trim();
  const repo = (Deno.env.get('GITHUB_DISPATCH_REPO') || '').trim();
  if (!pat || !repo) {
    return { ok: false, status: 0, body: 'missing GITHUB_DISPATCH_PAT or GITHUB_DISPATCH_REPO' };
  }
  const ref = (Deno.env.get('GITHUB_DISPATCH_REF') || 'main').trim() || 'main';
  const res = await fetch(
    `https://api.github.com/repos/${repo}/actions/workflows/portfolio-sync.yml/dispatches`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${pat}`,
        Accept: 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28',
        'User-Agent': 'supabase-edge-dispatch-portfolio-sync',
      },
      body: JSON.stringify({ ref }),
    },
  );
  const body = res.ok ? null : await res.text();
  return { ok: res.ok, status: res.status, body: body?.slice(0, 400) ?? null };
}

Deno.serve(async (req) => {
  if (req.method !== 'POST' && req.method !== 'GET') {
    return json({ error: 'method_not_allowed' }, 405);
  }

  const expected = (Deno.env.get('PORTFOLIO_CRON_SECRET') || '').trim();
  const got = (req.headers.get('x-portfolio-cron') || '').trim();
  if (!expected) {
    return json({ error: 'unauthorized', reason: 'PORTFOLIO_CRON_SECRET_edge_secret_missing' }, 401);
  }
  if (got !== expected) {
    return json({ error: 'unauthorized', reason: 'x_portfolio_cron_mismatch' }, 401);
  }

  try {
    const gh = await dispatchPortfolioWorkflow();
    return json(
      {
        ok: gh.ok,
        mode: 'github_dispatch',
        workflow: 'portfolio-sync.yml',
        github_http: gh.status,
        github_body: gh.body,
        hint: gh.ok
          ? 'GitHub Actions Portfolio sync kuyruğa alındı (birkaç dk içinde çalışır).'
          : 'PAT yetkisi (repo + workflow) veya repo adını kontrol et.',
      },
      gh.ok ? 200 : 502,
    );
  } catch (e) {
    console.error(e);
    const msg = e instanceof Error ? e.message : String(e);
    return json({ ok: false, error: msg }, 500);
  }
});
