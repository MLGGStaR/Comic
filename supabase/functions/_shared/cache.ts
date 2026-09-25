// Server-side response cache in Postgres (comic_cache), service role only.
// Stale entries are served when the upstream fails.
const URL_ = Deno.env.get('SUPABASE_URL')!;
const KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const H = { apikey: KEY, Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json' };

export async function cacheGet<T>(key: string): Promise<{ data: T; at: number } | null> {
  try {
    const r = await fetch(`${URL_}/rest/v1/comic_cache?select=data,updated_at&key=eq.${encodeURIComponent(key)}`, { headers: H });
    if (!r.ok) return null;
    const rows = (await r.json()) as { data: T; updated_at: string }[];
    return rows[0] ? { data: rows[0].data, at: Date.parse(rows[0].updated_at) } : null;
  } catch {
    return null;
  }
}

export async function cachePut(key: string, data: unknown): Promise<void> {
  try {
    await fetch(`${URL_}/rest/v1/comic_cache`, {
      method: 'POST',
      headers: { ...H, Prefer: 'resolution=merge-duplicates,return=minimal' },
      body: JSON.stringify({ key, data, updated_at: new Date().toISOString() }),
    });
  } catch {
    // cache writes are best-effort
  }
}

export async function cached<T>(key: string, ttlMs: number, fn: () => Promise<T>, opts?: { force?: boolean }): Promise<T> {
  const hit = await cacheGet<T>(key);
  if (hit && !opts?.force && Date.now() - hit.at < ttlMs) return hit.data;
  try {
    const data = await fn();
    await cachePut(key, data);
    return data;
  } catch (e) {
    if (hit) return hit.data;
    throw e;
  }
}

export async function upcGet(code: string) {
  const r = await fetch(`${URL_}/rest/v1/comic_upc?select=*&code=eq.${encodeURIComponent(code)}`, { headers: H });
  if (!r.ok) return null;
  const rows = (await r.json()) as { code: string; series_id: string | null; comic_id: string | null; meta: unknown }[];
  return rows[0] ?? null;
}

export async function upcPut(row: { code: string; series_id?: string | null; comic_id?: string | null; meta?: unknown; source: string }) {
  await fetch(`${URL_}/rest/v1/comic_upc`, {
    method: 'POST',
    headers: { ...H, Prefer: 'resolution=merge-duplicates,return=minimal' },
    body: JSON.stringify({ ...row, updated_at: new Date().toISOString() }),
  }).catch(() => {});
}
