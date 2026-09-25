// All comic data goes through one Supabase Edge Function (`comic-api`),
// which fetches, parses and caches the sources server-side. The client adds
// an IndexedDB layer: cached answers render instantly, then refresh.
import { useEffect, useRef, useState } from 'react';
import { SUPABASE_ANON, SUPABASE_URL, supabase } from '../supabase';
import { idbGet, idbSet } from '../lib/idb';
import type { ComicDetail, ComicLite, SearchResult, SeriesDetail } from '../types';

const FN = `${SUPABASE_URL}/functions/v1/comic-api`;
const HOUR = 3600e3;

export interface PriceEstimate {
  comicId: string;
  variantId?: string | null;
  raw: number | null; // typical raw/ungraded copy
  low?: number | null;
  high?: number | null;
  sales?: number | null; // how many data points
  source: string;
  url?: string | null;
  at: string;
}

export interface UpcMatch {
  comic: ComicLite | null;
  variantId?: string | null;
  candidates: ComicLite[];
  note?: string | null;
}

async function authHeader(): Promise<string> {
  const { data } = await supabase.auth.getSession();
  return `Bearer ${data.session?.access_token ?? SUPABASE_ANON}`;
}

async function fetchJson<T>(op: string, params: Record<string, string>, init?: RequestInit): Promise<T> {
  const url = new URL(FN);
  url.searchParams.set('op', op);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  const ctl = new AbortController();
  const timer = window.setTimeout(() => ctl.abort(), 25000);
  try {
    const r = await fetch(url, {
      ...init,
      signal: ctl.signal,
      headers: { apikey: SUPABASE_ANON, Authorization: await authHeader(), ...(init?.headers ?? {}) },
    });
    if (!r.ok) {
      const body = await r.text().catch(() => '');
      throw new Error(body.slice(0, 160) || `${op} failed (${r.status})`);
    }
    return (await r.json()) as T;
  } finally {
    window.clearTimeout(timer);
  }
}

type Cached<T> = { t: number; data: T };
const cacheKey = (op: string, params: Record<string, string>) => `api:${op}:${JSON.stringify(params)}`;

/** Cached GET: fresh cache → return; else fetch (falling back to stale cache on failure). */
async function cachedCall<T>(op: string, params: Record<string, string>, ttl: number): Promise<T> {
  const key = cacheKey(op, params);
  const hit = await idbGet<Cached<T>>(key);
  if (hit && Date.now() - hit.t < ttl) return hit.data;
  try {
    const data = await fetchJson<T>(op, params);
    void idbSet(key, { t: Date.now(), data });
    return data;
  } catch (e) {
    if (hit) return hit.data;
    throw e;
  }
}

/** Stale-while-revalidate: cached value now (if any), fresh value later. */
async function swr<T>(op: string, params: Record<string, string>, ttl: number, onData: (d: T, fresh: boolean) => void): Promise<void> {
  const key = cacheKey(op, params);
  const hit = await idbGet<Cached<T>>(key);
  if (hit) onData(hit.data, Date.now() - hit.t < ttl);
  if (hit && Date.now() - hit.t < ttl) return;
  const data = await fetchJson<T>(op, params);
  void idbSet(key, { t: Date.now(), data });
  onData(data, true);
}

function weekTtl(date: string): number {
  const d = new Date(`${date}T00:00:00`).getTime();
  const age = Date.now() - d;
  if (age > 21 * 86400e3) return 7 * 24 * HOUR; // long past: stable
  return 6 * HOUR; // this week / upcoming: solicitations change
}

export const api = {
  search: (q: string) => cachedCall<SearchResult>('search', { q: q.trim().toLowerCase() }, 6 * HOUR),
  comic: (id: string) => cachedCall<ComicDetail>('comic', { id }, 12 * HOUR),
  series: (id: string) => cachedCall<SeriesDetail>('series', { id }, 6 * HOUR),
  week: (date: string) => cachedCall<ComicLite[]>('week', { date }, weekTtl(date)),
  upc: (code: string) => cachedCall<UpcMatch>('upc', { code }, 24 * HOUR),
  price: (id: string, variant?: string) =>
    cachedCall<PriceEstimate>('price', variant ? { id, variant } : { id }, 24 * HOUR),
  swr,
  weekTtl,
  /** Identify a comic from a photo of its cover (server calls Claude vision). */
  scan: (imageBase64: string, hint?: string) =>
    fetchJson<UpcMatch & { read?: { series?: string; issue?: string; publisher?: string; variant?: string } }>(
      'scan',
      {},
      { method: 'POST', body: JSON.stringify({ image: imageBase64, hint }), headers: { 'Content-Type': 'application/json' } },
    ),
};

/** React hook: cached-first data for one API call; refetches when `key` changes. */
export function useApi<T>(op: string, params: Record<string, string> | null, ttl: number) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(!!params);
  const seq = useRef(0);
  const key = params ? JSON.stringify(params) : null;
  const [nonce, setNonce] = useState(0);

  useEffect(() => {
    if (!params) return;
    const my = ++seq.current;
    setLoading(true);
    setError(null);
    swr<T>(op, params, nonce ? 0 : ttl, (d) => {
      if (seq.current === my) setData(d);
    })
      .catch((e: Error) => {
        if (seq.current === my) setError(e.message);
      })
      .finally(() => {
        if (seq.current === my) setLoading(false);
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [op, key, nonce]);

  return { data, error, loading, reload: () => setNonce((n) => n + 1) };
}
