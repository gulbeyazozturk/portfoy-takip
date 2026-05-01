import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.1';

type PushPayload = {
  title: string;
  body: string;
  data?: Record<string, unknown>;
  user_ids?: string[];
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
  });
}

function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

async function sendExpoChunk(messages: unknown[]) {
  const res = await fetch('https://exp.host/--/api/v2/push/send', {
    method: 'POST',
    headers: {
      Accept: 'application/json',
      'Accept-Encoding': 'gzip, deflate',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(messages),
  });
  const body = await res.json().catch(() => null);
  return { ok: res.ok, status: res.status, body };
}

Deno.serve(async (req) => {
  if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405);

  const secret = (Deno.env.get('PUSH_CRON_SECRET') || '').trim();
  const got = (req.headers.get('x-push-cron') || '').trim();
  if (!secret || got !== secret) {
    return json({ error: 'unauthorized' }, 401);
  }

  const url = (Deno.env.get('SUPABASE_URL') || '').trim();
  const serviceRole = (Deno.env.get('SERVICE_ROLE_KEY') || '').trim();
  if (!url || !serviceRole) return json({ error: 'missing_supabase_env' }, 500);
  const supabase = createClient(url, serviceRole);

  let payload: PushPayload;
  try {
    payload = (await req.json()) as PushPayload;
  } catch {
    return json({ error: 'invalid_json' }, 400);
  }

  const title = (payload.title || '').trim();
  const body = (payload.body || '').trim();
  if (!title || !body) {
    return json({ error: 'missing_title_or_body' }, 400);
  }

  let q = supabase
    .from('user_push_tokens')
    .select('expo_push_token')
    .eq('enabled', true);
  if (payload.user_ids && payload.user_ids.length > 0) {
    q = q.in('user_id', payload.user_ids);
  }

  const { data: rows, error } = await q.limit(10000);
  if (error) return json({ error: error.message }, 500);
  const tokens = (rows || [])
    .map((r) => String(r.expo_push_token || '').trim())
    .filter((t) => t.startsWith('ExponentPushToken['));
  if (!tokens.length) return json({ ok: true, sent: 0, detail: 'no_tokens' });

  const messages = tokens.map((to) => ({
    to,
    sound: 'default',
    title,
    body,
    data: payload.data ?? {},
  }));

  let sent = 0;
  const failed: Array<{ status: number; error: string }> = [];
  for (const msgChunk of chunk(messages, 100)) {
    const result = await sendExpoChunk(msgChunk);
    if (!result.ok) {
      failed.push({ status: result.status, error: JSON.stringify(result.body).slice(0, 300) });
      continue;
    }
    const data = Array.isArray(result.body?.data) ? result.body.data : [];
    sent += data.length;
  }

  return json({
    ok: failed.length === 0,
    tokens: tokens.length,
    sent,
    failed,
  });
});

