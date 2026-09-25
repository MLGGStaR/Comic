// Live check of the comic-api Edge Function: node scripts/api-check.mjs [op ...]
const BASE = 'https://fotppunwikhxhvzzlgfy.supabase.co/functions/v1/comic-api';
const ANON =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZvdHBwdW53aWtoeGh2enpsZ2Z5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODQ3OTQ2MDIsImV4cCI6MjEwMDM3MDYwMn0.XhR8V1VN4ffxqiShq2g5NOgx9DL9N1lstznNMlqFM3E';

async function call(params) {
  const t0 = Date.now();
  const r = await fetch(`${BASE}?${new URLSearchParams(params)}`, { headers: { apikey: ANON, Authorization: `Bearer ${ANON}` } });
  const text = await r.text();
  let j;
  try {
    j = JSON.parse(text);
  } catch {
    j = text.slice(0, 300);
  }
  return { status: r.status, ms: Date.now() - t0, j };
}

const show = (c) => (c ? `${c.id} ${c.title} [${c.format}${c.formatLabel ? '/' + c.formatLabel : ''}] ${c.publisher ?? ''} ${c.releaseDate ?? ''} $${c.price ?? '-'} series=${c.seriesId ?? '-'}` : 'null');
const hit = (h) => (h ? (h.kind === 'comic' ? `COMIC ${show(h.comic)}` : `SERIES ${h.series.id} ${h.series.title} (${h.series.publisher}, ${h.series.years}, ${h.series.count})`) : 'null');

const which = process.argv.slice(2);
const want = (k) => !which.length || which.includes(k);

if (want('search')) {
  for (const q of ['absolute batman', 'absolute batman #2', 'absolute batman 2', 'absolute batman vol 1', 'saga #1', 'amazing spider-man #300', 'batman (2016) #50', 'x-men 97 #1']) {
    const { status, ms, j } = await call({ op: 'search', q });
    console.log(`search "${q}" → ${status} ${ms}ms\n   top: ${hit(j.top)}\n   more: ${(j.more ?? []).length} ${j.error ?? ''}`);
  }
}
if (want('series')) {
  const { status, ms, j } = await call({ op: 'series', id: '178012' });
  console.log(`series 178012 → ${status} ${ms}ms ${j.title} | ${j.publisher} | ${j.years} | issues ${j.issues?.length} | collections ${j.collections?.length} ${j.error ?? ''}`);
}
if (want('week')) {
  const { status, ms, j } = await call({ op: 'week', date: '2026-09-23' });
  const arr = Array.isArray(j) ? j : [];
  console.log(`week 2026-09-23 → ${status} ${ms}ms items=${arr.length} issues=${arr.filter((c) => c.format === 'issue').length} collections=${arr.filter((c) => c.format === 'collection').length} ${j.error ?? ''}`);
  arr.slice(0, 5).forEach((c) => console.log('   ', show(c), 'pulls', c.pulls));
}
if (want('comic')) {
  const { status, ms, j } = await call({ op: 'comic', id: '8081353', title: 'Absolute Batman #2', seriesId: '178012', series: 'Absolute Batman' });
  console.log(`comic 8081353 → ${status} ${ms}ms ${show(j)} variants=${j.variants?.length} prev=${j.prev?.number} next=${j.next?.number} desc=${(j.description ?? '').slice(0, 60)} ${j.error ?? ''}`);
  const { status: s2, ms: m2, j: j2 } = await call({ op: 'comic', id: '3952461', title: 'Absolute Batman #24', publisher: 'DC Comics' });
  console.log(`comic 3952461 (no series hint) → ${s2} ${m2}ms ${show(j2)} variants=${j2.variants?.length} ${j2.error ?? ''}`);
}
if (want('upc')) {
  for (const code of ['76194138584600211', '76194138584600221', '761941385846', '9781799505259']) {
    const { status, ms, j } = await call({ op: 'upc', code });
    console.log(`upc ${code} → ${status} ${ms}ms ${show(j.comic)} variant=${j.variantId ?? '-'} ${j.note ?? ''} candidates=${j.candidates?.length ?? 0} ${j.error ?? ''}`);
  }
}
