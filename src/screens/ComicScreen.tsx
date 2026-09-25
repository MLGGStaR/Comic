// The comic page: big cover over a blurred backdrop, Have / Read / Wishlist,
// your rating, then tabs — Overview, Variants (log each cover you own) and
// Reviews (friends first, then the community and critics).
import { useEffect, useMemo, useRef, useState } from 'react';
import { api, comicParams, type ComicExtras } from '../api/client';
import { priceFor, type PriceEstimate } from '../api/prices';
import { removeCustomCover } from '../api/covers';
import { estimateFor } from '../state/values';
import type { ComicDetail, ComicLite, OwnedVariant, Variant, Review } from '../types';
import { GradeSheet, gradeLabel } from '../ui/GradeSheet';
import { AddCoverSheet, CoverPicker, allCovers, coversChanged, toggleOwnedCover } from '../ui/CoverPicker';
import { Screen } from '../ui/Screen';
import { Cover } from '../ui/Cover';
import { StarPicker, Stars, starsOf } from '../ui/Stars';
import { StatusToggles } from '../ui/StatusToggles';
import { Icon } from '../ui/Icon';
import { Empty } from '../ui/layout';
import { FriendDot } from '../ui/FriendDot';
import { useActions } from '../state/actions';
import { collection, useEntry } from '../state/collection';
import { profileById, useProfiles } from '../state/profiles';
import { supabase } from '../supabase';
import { fmtDate, fmtMoney, relTime, shortDate } from '../lib/format';
import { isoDay } from '../lib/entry';
import { valueOf } from '../lib/shelf';
import { useBackLayer } from '../lib/backstack';
import { toast } from '../ui/toast';
import { compact } from '../views/Search';

type Tab = 'overview' | 'variants' | 'reviews';

export function ComicScreen({ id, seed, onClose }: { id: string; seed?: ComicLite; onClose: () => void }) {
  const [core, setCore] = useState<ComicDetail | null>(null);
  const [extras, setExtras] = useState<ComicExtras | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>('overview');
  const [zoom, setZoom] = useState<{ src: string | null; title: string; variant?: Variant } | null>(null);
  const [nonce, setNonce] = useState(0);
  const entry = useEntry(id);
  const a = useActions();

  // a cover photo was added / removed: refetch (the cached copy was dropped)
  useEffect(() => coversChanged.on((cid) => cid === id && setNonce((n) => n + 1)), [id]);

  // the page itself: detail + every cover (fast)
  useEffect(() => {
    let alive = true;
    setErr(null);
    const hint = seed ?? collection.entry(id)?.meta ?? { id };
    api.swr<ComicDetail>('comic', comicParams(hint), 12 * 3600e3, (d) => alive && setCore(d)).catch((e: Error) => alive && setErr(e.message));
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, nonce]);

  // reviews, scores, credits, previous / next: slower sources, fetched
  // alongside — they need the title + series, from the seed or the detail
  const hintFor = seed?.seriesId ? seed : entry?.meta.seriesId ? entry.meta : core;
  const hintReady = !!hintFor;
  useEffect(() => {
    if (!hintFor) return;
    let alive = true;
    api.swr<ComicExtras>('extras', comicParams(hintFor), 12 * 3600e3, (d) => alive && setExtras(d)).catch(() => alive && setExtras({}));
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, hintReady]);

  const detail: ComicDetail | null = useMemo(() => {
    if (!core) return null;
    const add = Object.fromEntries(Object.entries(extras ?? {}).filter(([, v]) => v != null && !(Array.isArray(v) && !v.length)));
    return { ...core, ...add };
  }, [core, extras]);
  const extrasLoading = extras == null;

  // the lite record everything else keys on (detail wins once it arrives)
  const lite: ComicLite | null = useMemo(() => {
    if (detail) return toLite(detail);
    return seed ?? entry?.meta ?? null;
  }, [detail, seed, entry?.meta]);

  // keep the stored snapshot fresh when the page learns more (cover, date…)
  useEffect(() => {
    if (!detail || !entry) return;
    const next = toLite(detail);
    if (JSON.stringify(next) !== JSON.stringify(entry.meta)) void collection.patch(next, {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [detail]);

  const title = lite?.title ?? 'Comic';

  return (
    <Screen onClose={onClose} title={title} transparentTop>
      {!lite && !err ? <HeroSkeleton /> : null}
      {!lite && err ? (
        <div className="pt-24">
          <Empty title="Couldn't load this comic">{err}</Empty>
        </div>
      ) : null}
      {lite ? (
        <>
          <Hero comic={lite} detail={detail} onZoom={() => setZoom({ src: detail?.cover ?? lite.cover, title: lite.title })} />
          <div className="px-4 -mt-2 space-y-5 pb-24">
            <TitleBlock comic={lite} detail={detail} />
            <StatusToggles comic={lite} size="lg" />
            {a.selfId ? <RatingRow comic={lite} /> : null}

            <div className="flex gap-1 border-b border-white/[0.07] sticky top-[calc(env(safe-area-inset-top)+52px)] z-10 bg-bg-0/95 backdrop-blur -mx-4 px-4">
              {(
                [
                  ['overview', 'Overview'],
                  ['variants', `Variants${detail ? ` ${detail.variants.length + 1}` : ''}`],
                  ['reviews', `Reviews${detail?.reviews.length ? ` ${detail.reviews.length}` : ''}`],
                ] as [Tab, string][]
              ).map(([k, label]) => (
                <button
                  key={k}
                  onClick={() => setTab(k)}
                  className={`px-3 py-2.5 text-[13px] font-semibold border-b-2 -mb-px transition-colors ${
                    tab === k ? 'border-lb-green text-ink-0' : 'border-transparent text-ink-2'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>

            {tab === 'overview' ? (
              <Overview comic={lite} detail={detail} err={err} />
            ) : tab === 'variants' ? (
              <Variants comic={lite} detail={detail} onZoom={(v) => setZoom({ src: v.cover, title: v.name, variant: v })} />
            ) : (
              <Reviews comic={lite} detail={detail} loading={extrasLoading} />
            )}
          </div>
        </>
      ) : null}
      {zoom ? <Zoom src={zoom.src} title={zoom.title} comicId={id} variant={zoom.variant} onClose={() => setZoom(null)} /> : null}
    </Screen>
  );
}

export function toLite(d: ComicDetail): ComicLite {
  return {
    id: d.id,
    title: d.title,
    series: d.series,
    seriesId: d.seriesId,
    number: d.number,
    format: d.format,
    formatLabel: d.formatLabel ?? null,
    publisher: d.publisher,
    releaseDate: d.releaseDate,
    cover: d.cover,
    price: d.price,
    pulls: d.pulls ?? null,
    rating: d.rating ?? null,
  };
}

/** The cover drawn into a tiny canvas and stretched: the smooth upscale IS the
 *  blur — no CSS filter for the phone to redraw while the page slides in. */
function Backdrop({ src }: { src: string }) {
  const ref = useRef<HTMLCanvasElement | null>(null);
  useEffect(() => {
    const img = new Image();
    img.referrerPolicy = 'no-referrer';
    img.onload = () => {
      const c = ref.current;
      const ctx = c?.getContext('2d');
      if (!c || !ctx) return;
      ctx.drawImage(img, 0, 0, c.width, c.height);
      c.style.opacity = '0.5';
    };
    img.src = src;
    return () => {
      img.onload = null;
    };
  }, [src]);
  return <canvas ref={ref} width={12} height={18} className="absolute inset-0 w-full h-full transition-opacity duration-500" style={{ opacity: 0 }} />;
}

function Hero({ comic, detail, onZoom }: { comic: ComicLite; detail: ComicDetail | null; onZoom: () => void }) {
  const src = detail?.cover ?? comic.cover;
  return (
    <div className="relative pt-[calc(env(safe-area-inset-top)+64px)] pb-6 overflow-hidden">
      {src ? (
        <div className="absolute inset-0 -z-0">
          <Backdrop src={src} />
          <div className="absolute inset-0 bg-gradient-to-b from-bg-0/30 via-bg-0/55 to-bg-0" />
        </div>
      ) : null}
      <button onClick={onZoom} className="relative block mx-auto w-[54%] max-w-[240px] aspect-[2/3] rounded-xl overflow-hidden bg-bg-2 shadow-[0_24px_60px_rgba(0,0,0,0.6)] pop-in">
        <Cover src={src} alt={comic.title} className="w-full h-full" eager />
      </button>
    </div>
  );
}

function TitleBlock({ comic, detail }: { comic: ComicLite; detail: ComicDetail | null }) {
  const a = useActions();
  const soon = comic.releaseDate && comic.releaseDate > isoDay(new Date());
  return (
    <div className="text-center">
      <div className="font-display text-[24px] font-extrabold leading-tight">{comic.title}</div>
      <div className="text-xs text-ink-2 mt-1.5">
        {[comic.format === 'collection' ? comic.formatLabel ?? 'Collected edition' : null, comic.publisher].filter(Boolean).join(' · ')}
      </div>
      <div className="text-xs mt-1">
        {comic.releaseDate ? (
          <span className={soon ? 'text-lb-blue font-semibold' : 'text-ink-1'}>
            {soon ? 'Out ' : ''}
            {fmtDate(comic.releaseDate, { year: true })}
          </span>
        ) : null}
        {comic.price != null ? <span className="text-ink-2"> · {fmtMoney(comic.price, { cents: true })}</span> : null}
      </div>
      {detail?.criticScore != null || detail?.userScore != null || comic.consensus != null || comic.pulls ? (
        <div className="flex justify-center flex-wrap gap-x-4 gap-y-1 mt-3 text-xs">
          {detail?.criticScore != null ? (
            <span className="text-ink-1">
              Critics <b className="text-ink-0">{detail.criticScore.toFixed(1)}</b>
              {detail.criticCount ? <span className="text-ink-2"> ({detail.criticCount})</span> : null}
            </span>
          ) : null}
          {detail?.userScore != null ? (
            <span className="text-ink-1">
              Readers <b className="text-ink-0">{detail.userScore.toFixed(1)}</b>
              {detail.userCount ? <span className="text-ink-2"> ({compact(detail.userCount)})</span> : null}
            </span>
          ) : null}
          {comic.consensus != null ? (
            <span className="text-ink-1">
              <b className="text-lb-green">{comic.consensus}%</b> liked
            </span>
          ) : null}
          {comic.pulls ? <span className="text-ink-2">{compact(comic.pulls)} pulls</span> : null}
        </div>
      ) : null}
      {comic.seriesId && comic.series ? (
        <button onClick={() => a.openSeries(comic.seriesId!, comic.series!)} className="mt-3 inline-flex items-center gap-1 text-xs font-semibold text-lb-green">
          All of {comic.series} <Icon name="chevron-right" size={14} />
        </button>
      ) : null}
    </div>
  );
}

function RatingRow({ comic }: { comic: ComicLite }) {
  const entry = useEntry(comic.id);
  const [rating, setRating] = useState(entry?.rating ?? 0);
  const pending = useRef<number | null>(null);
  const timer = useRef<number | null>(null);
  useEffect(() => {
    if (pending.current == null) setRating(entry?.rating ?? 0);
  }, [entry?.rating]);
  const flush = () => {
    if (timer.current) window.clearTimeout(timer.current);
    const r = pending.current;
    pending.current = null;
    if (r != null) void collection.patch(comic, { rating: r });
  };
  useEffect(() => flush, []); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <div className="rounded-2xl bg-bg-1 border border-white/[0.05] py-2">
      <StarPicker
        value={rating}
        onChange={(v) => {
          setRating(v);
          pending.current = v;
          if (timer.current) window.clearTimeout(timer.current);
          timer.current = window.setTimeout(flush, 650);
        }}
      />
      <div className="flex items-center justify-center gap-2 h-8 text-xs">
        {entry?.read ? (
          <>
            <span className="text-ink-2">read</span>
            <input
              type="date"
              value={entry.readAt ?? ''}
              max={isoDay(new Date())}
              onChange={(e) => e.target.value && void collection.patch(comic, { read: true, readAt: e.target.value })}
              className="bg-bg-2 rounded-lg px-2 py-1 text-sm text-ink-0"
            />
          </>
        ) : (
          <span className="text-ink-2">rate to log it as read</span>
        )}
      </div>
    </div>
  );
}

function Overview({ comic, detail, err }: { comic: ComicLite; detail: ComicDetail | null; err: string | null }) {
  const a = useActions();
  const [more, setMore] = useState(false);
  if (!detail) {
    return err ? (
      <div className="text-xs text-ink-2 text-center py-6">{err}</div>
    ) : (
      <div className="space-y-2 py-2">
        <div className="h-3 rounded skeleton w-full" />
        <div className="h-3 rounded skeleton w-11/12" />
        <div className="h-3 rounded skeleton w-4/5" />
      </div>
    );
  }
  const creators = groupCreators(detail.creators);
  const facts: [string, string | null | undefined][] = [
    ['Format', detail.formatLabel ?? (detail.format === 'issue' ? 'Comic' : 'Collected edition')],
    ['Release', fmtDate(detail.releaseDate, { year: true })],
    ['Final order cutoff', fmtDate(detail.focDate, { year: true })],
    ['Cover price', detail.price != null ? fmtMoney(detail.price, { cents: true }) : null],
    ['Pages', detail.pages ? String(detail.pages) : null],
    ['UPC', detail.upc],
    ['ISBN', detail.isbn],
  ];
  return (
    <div className="space-y-6 fade-in">
      {detail.description ? (
        <div>
          <p className={`text-[14px] leading-relaxed text-ink-1 whitespace-pre-line ${more ? '' : 'line-clamp-5'}`}>{detail.description}</p>
          {detail.description.length > 280 ? (
            <button onClick={() => setMore((m) => !m)} className="text-xs font-semibold text-lb-blue mt-1">
              {more ? 'Less' : 'More'}
            </button>
          ) : null}
        </div>
      ) : null}

      <YourCopy comic={comic} detail={detail} />
      <MarketValue comic={comic} />

      {creators.length ? (
        <div className="grid grid-cols-2 gap-x-4 gap-y-3">
          {creators.map(([role, names]) => (
            <div key={role} className="min-w-0">
              <div className="text-[10px] uppercase tracking-[0.14em] text-ink-2 font-semibold">{role}</div>
              <div className="text-[13px] text-ink-0 mt-0.5 leading-snug">{names.join(', ')}</div>
            </div>
          ))}
        </div>
      ) : null}

      <div className="rounded-2xl bg-bg-1 border border-white/[0.05] divide-y divide-white/[0.05]">
        {facts
          .filter(([, v]) => v)
          .map(([k, v]) => (
            <div key={k} className="flex justify-between gap-3 px-4 py-2.5 text-[13px]">
              <span className="text-ink-2">{k}</span>
              <span className="text-ink-0 text-right">{v}</span>
            </div>
          ))}
      </div>

      {detail.prev || detail.next ? (
        <div className="grid grid-cols-2 gap-2">
          <button
            disabled={!detail.prev}
            onClick={() => detail.prev && a.openComic(detail.prev)}
            className="py-2.5 rounded-xl bg-bg-1 text-xs font-semibold text-ink-1 disabled:opacity-30 flex items-center justify-center gap-1"
          >
            <Icon name="chevron-left" size={14} /> {detail.prev?.number ? `#${detail.prev.number}` : 'Previous'}
          </button>
          <button
            disabled={!detail.next}
            onClick={() => detail.next && a.openComic(detail.next)}
            className="py-2.5 rounded-xl bg-bg-1 text-xs font-semibold text-ink-1 disabled:opacity-30 flex items-center justify-center gap-1"
          >
            {detail.next?.number ? `#${detail.next.number}` : 'Next'} <Icon name="chevron-right" size={14} />
          </button>
        </div>
      ) : null}

      {detail.characters?.length ? (
        <div>
          <div className="text-[10px] uppercase tracking-[0.14em] text-ink-2 font-semibold mb-1.5">Characters</div>
          <div className="flex flex-wrap gap-1.5">
            {detail.characters.slice(0, 16).map((c) => (
              <span key={c} className="px-2 py-1 rounded-md bg-bg-1 text-[11px] text-ink-1">
                {c}
              </span>
            ))}
          </div>
        </div>
      ) : null}

      {detail.url ? (
        <a href={detail.url} target="_blank" rel="noreferrer" className="block text-center text-[11px] text-ink-2 py-2">
          Data from {sourceName(detail.url)} ↗
        </a>
      ) : null}
    </div>
  );
}

function MarketValue({ comic }: { comic: ComicLite }) {
  const [p, setP] = useState<PriceEstimate | null | undefined>(undefined);
  useEffect(() => {
    let alive = true;
    priceFor(comic)
      .then((v) => alive && setP(v))
      .catch(() => alive && setP(null));
    return () => {
      alive = false;
    };
  }, [comic]);
  if (comic.format !== 'issue') return null;
  if (p === undefined) return <div className="h-14 rounded-2xl skeleton" />;
  if (!p?.raw) return null;
  const grades = SHOWN_GRADES.filter((k) => p.grades[k] != null);
  return (
    <div className="rounded-2xl bg-bg-1 border border-white/[0.05] px-4 py-3">
      <a href={p.url} target="_blank" rel="noreferrer" className="flex items-center justify-between">
        <div>
          <div className="text-[10px] uppercase tracking-[0.14em] text-ink-2 font-semibold">Market value</div>
          <div className="text-[11px] text-ink-2 mt-0.5">raw copy · via PriceCharting ↗</div>
        </div>
        <div className="font-display text-xl font-extrabold text-lb-green leading-none">{fmtMoney(p.raw)}</div>
      </a>
      {grades.length ? (
        <>
          <div className="text-[10px] uppercase tracking-[0.14em] text-ink-2 font-semibold mt-3 mb-1.5">Graded (CGC / CBCS)</div>
          <div className="grid grid-cols-4 gap-1.5">
            {grades.map((k) => (
              <div key={k} className="rounded-lg bg-bg-2 px-2 py-1.5 text-center">
                <div className="text-[10px] text-ink-2 font-semibold">{k}</div>
                <div className="text-[13px] font-bold tabular-nums">{fmtMoney(p.grades[k])}</div>
              </div>
            ))}
          </div>
          {!p.full ? <div className="text-[10px] text-ink-2 mt-2">9.0–10 prices need a PriceCharting API token (Settings).</div> : null}
        </>
      ) : null}
    </div>
  );
}

const SHOWN_GRADES = ['10.0', '9.8', '9.6', '9.4', '9.2', '9.0', '8.0', '7.0', '6.0', '5.0', '4.0', '3.0', '2.0'];

function YourCopy({ comic, detail }: { comic: ComicLite; detail: ComicDetail | null }) {
  const entry = useEntry(comic.id);
  const [edit, setEdit] = useState(false);
  const [paid, setPaid] = useState('');
  const [value, setValue] = useState('');
  const [grading, setGrading] = useState<OwnedVariant | null>(null);
  const variantKey = entry?.variants.map((v) => `${v.id}:${v.grade ? `${v.grade.by}${v.grade.grade}` : 'raw'}`).join(',') ?? '';
  useEffect(() => {
    if (!entry?.owned) return;
    let alive = true;
    estimateFor(entry)
      .then((est) => {
        const cur = collection.entry(comic.id);
        if (alive && cur?.owned && est !== cur.est) void collection.patch(cur.meta, { est });
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [comic.id, entry?.owned, variantKey]);
  if (!entry?.owned) return null;
  const v = valueOf(entry);
  const copies = Math.max(1, entry.variants.length);
  const save = () => {
    const num = (s: string) => (s.trim() === '' ? null : Math.max(0, Number(s.replace(/[^0-9.]/g, ''))));
    void collection.patch(comic, { paid: num(paid), value: num(value) });
    setEdit(false);
    toast('Saved');
  };
  return (
    <div className="rounded-2xl border border-lb-green/25 bg-lb-green/[0.06] p-4">
      <div className="flex items-start justify-between">
        <div>
          <div className="text-[10px] uppercase tracking-[0.14em] text-lb-green font-bold">Your copy{copies > 1 ? `ies · ${copies}` : ''}</div>
          <div className="font-display text-[26px] font-extrabold leading-none mt-1.5">{fmtMoney(v.amount)}</div>
          <div className="text-[11px] text-ink-2 mt-1">
            {v.basis === 'yours' ? 'your value' : v.basis === 'market' ? 'market estimate' : v.basis === 'cover' ? 'at cover price' : 'no value yet'}
            {entry.paid != null ? ` · paid ${fmtMoney(entry.paid)}` : ''}
          </div>
        </div>
        <button
          onClick={() => {
            setPaid(entry.paid != null ? String(entry.paid) : '');
            setValue(entry.value != null ? String(entry.value) : '');
            setEdit((e) => !e);
          }}
          className="px-3 py-1.5 rounded-lg bg-bg-2 text-xs font-semibold text-ink-1"
        >
          {edit ? 'Cancel' : 'Edit'}
        </button>
      </div>
      {edit ? (
        <div className="grid grid-cols-2 gap-2 mt-3 fade-in">
          <label className="text-[11px] text-ink-2">
            Paid
            <input inputMode="decimal" value={paid} onChange={(e) => setPaid(e.target.value)} placeholder="$0.00" className="mt-1 w-full bg-bg-2 rounded-lg px-3 py-2 text-ink-0" />
          </label>
          <label className="text-[11px] text-ink-2">
            Your value
            <input inputMode="decimal" value={value} onChange={(e) => setValue(e.target.value)} placeholder="auto" className="mt-1 w-full bg-bg-2 rounded-lg px-3 py-2 text-ink-0" />
          </label>
          <button onClick={save} className="col-span-2 btn-primary">
            Save
          </button>
        </div>
      ) : null}
      {entry.variants.length ? (
        <div className="mt-3 space-y-1.5">
          {entry.variants.map((c) => (
            <div key={c.id} className="flex items-center gap-2.5">
              <div className="w-7 aspect-[2/3] rounded overflow-hidden bg-bg-2 flex-shrink-0">
                <Cover src={c.cover} alt={c.name} className="w-full h-full" />
              </div>
              <div className="flex-1 min-w-0 text-[12px] text-ink-1 truncate">{c.name}</div>
              <button
                onClick={() => setGrading(c)}
                className={`flex-shrink-0 px-2.5 py-1 rounded-lg text-[11px] font-bold ${c.grade ? 'bg-lb-blue text-bg-0' : 'bg-bg-2 text-ink-2'}`}
              >
                {c.grade ? gradeLabel(c.grade) : 'Raw · graded?'}
              </button>
            </div>
          ))}
        </div>
      ) : null}
      {v.unpicked ? <CoverPicker comic={comic} detail={detail} className="mt-3 !bg-bg-0/50" /> : null}
      {grading ? <GradeSheet comic={comic} cover={grading} onClose={() => setGrading(null)} /> : null}
    </div>
  );
}

function Variants({ comic, detail, onZoom }: { comic: ComicLite; detail: ComicDetail | null; onZoom: (v: Variant) => void }) {
  const entry = useEntry(comic.id);
  const a = useActions();
  const [adding, setAdding] = useState(false);
  if (!detail) return <div className="grid grid-cols-3 gap-2">{Array.from({ length: 6 }).map((_, i) => <div key={i} className="aspect-[2/3] rounded-lg skeleton" />)}</div>;
  const all = allCovers(comic, detail);
  const ownedIds = new Set(entry?.variants.map((v) => v.id) ?? []);
  const unpicked = !!entry?.owned && ownedIds.size === 0;

  const toggle = (v: Variant) => {
    if (!a.requireLogin()) return;
    navigator.vibrate?.(8);
    const added = toggleOwnedCover(comic, v);
    toast(added ? `Logged ${v.name}` : `Removed ${v.name}`);
  };

  return (
    <div className="fade-in">
      {unpicked ? (
        <div className="rounded-xl bg-lb-orange/[0.08] border border-lb-orange/25 px-3 py-2.5 mb-3 text-[12px] text-lb-orange font-semibold">
          You have this comic — tap ＋ on the cover you own so it’s valued right.
        </div>
      ) : null}
      <div className="text-xs text-ink-2 mb-3">
        {all.length} cover{all.length === 1 ? '' : 's'} · tap ＋ to log the ones you own
        {ownedIds.size ? <span className="text-lb-green"> · you have {ownedIds.size}</span> : null}
      </div>
      <div className="grid grid-cols-3 gap-2.5">
        {all.map((v) => {
          const own = ownedIds.has(v.id);
          return (
            <div key={v.id} className="min-w-0">
              <div className={`relative aspect-[2/3] rounded-lg overflow-hidden bg-bg-2 ${own ? 'ring-2 ring-lb-green' : ''}`}>
                <button onClick={() => onZoom(v)} className="w-full h-full block">
                  <Cover src={v.cover} alt={v.name} className="w-full h-full" />
                </button>
                <button
                  onClick={() => toggle(v)}
                  aria-pressed={own}
                  aria-label={own ? `Remove ${v.name}` : `I own ${v.name}`}
                  className={`absolute bottom-1.5 right-1.5 w-8 h-8 rounded-full flex items-center justify-center shadow-lg border ${
                    own ? 'bg-lb-green text-bg-0 border-lb-green' : 'bg-black/60 text-ink-0 border-white/30 backdrop-blur'
                  }`}
                >
                  <Icon name={own ? 'check' : 'plus'} size={16} strokeWidth={3} />
                </button>
                {v.ratio ? (
                  <span className="absolute top-1 left-1 rounded bg-lb-orange/90 text-bg-0 px-1 text-[9px] font-extrabold">{v.ratio}</span>
                ) : v.custom ? (
                  <span className="absolute top-1 left-1 rounded bg-black/70 text-ink-0 px-1 text-[9px] font-extrabold">PHOTO</span>
                ) : null}
              </div>
              <div className="text-[10px] text-ink-1 mt-1 leading-tight line-clamp-2">{v.name}</div>
            </div>
          );
        })}
        <button onClick={() => (a.requireLogin() ? setAdding(true) : undefined)} className="min-w-0 text-left">
          <div className="aspect-[2/3] rounded-lg border border-dashed border-white/25 flex flex-col items-center justify-center gap-1.5 text-ink-2 px-2 text-center">
            <Icon name="camera" size={22} />
            <span className="text-[11px] font-semibold leading-tight">Cover not listed?</span>
          </div>
          <div className="text-[10px] text-ink-2 mt-1 leading-tight">Add yours from a photo</div>
        </button>
      </div>
      {adding ? <AddCoverSheet comic={comic} onClose={() => setAdding(false)} /> : null}
    </div>
  );
}

function Reviews({ comic, detail, loading }: { comic: ComicLite; detail: ComicDetail | null; loading: boolean }) {
  useProfiles();
  const a = useActions();
  const entry = useEntry(comic.id);
  const [friends, setFriends] = useState<{ userId: string; rating: number | null; review: string | null; readAt: string | null; updatedAt: string }[]>([]);
  const [text, setText] = useState(entry?.review ?? '');
  const [editing, setEditing] = useState(false);

  useEffect(() => {
    let alive = true;
    supabase
      .from('comic_entries')
      .select('user_id, rating, review, read_at, updated_at')
      .eq('comic_id', comic.id)
      .eq('read', true)
      .then(({ data }) => {
        if (!alive || !data) return;
        setFriends(
          (data as { user_id: string; rating: number | string | null; review: string | null; read_at: string | null; updated_at: string }[])
            .filter((r) => r.user_id !== a.selfId)
            .map((r) => ({ userId: r.user_id, rating: r.rating == null ? null : Number(r.rating), review: r.review, readAt: r.read_at, updatedAt: r.updated_at })),
        );
      });
    return () => {
      alive = false;
    };
  }, [comic.id, a.selfId]);

  const community = (detail?.reviews ?? []).filter((r) => !r.critic);
  const critics = (detail?.reviews ?? []).filter((r) => r.critic);
  const friendAvg = friends.filter((f) => f.rating != null);
  const [showCritics, setShowCritics] = useState(6);
  const [showCommunity, setShowCommunity] = useState(10);

  return (
    <div className="space-y-6 fade-in">
      {a.selfId ? (
        <div className="rounded-2xl bg-bg-1 border border-white/[0.05] p-4">
          <div className="text-[10px] uppercase tracking-[0.14em] text-ink-2 font-semibold mb-2">Your review</div>
          {editing ? (
            <>
              <textarea
                value={text}
                onChange={(e) => setText(e.target.value)}
                rows={4}
                autoFocus
                placeholder="What did you think?"
                className="w-full bg-bg-2 rounded-xl px-3 py-2.5 text-[15px] leading-relaxed focus:outline-none resize-none"
              />
              <div className="flex gap-2 mt-2">
                <button onClick={() => setEditing(false)} className="flex-1 py-2 rounded-xl bg-bg-2 text-sm font-semibold text-ink-1">
                  Cancel
                </button>
                <button
                  onClick={() => {
                    void collection.patch(comic, { review: text.trim() || null, read: true });
                    setEditing(false);
                    toast('Review saved');
                  }}
                  className="flex-1 btn-primary"
                >
                  Save
                </button>
              </div>
            </>
          ) : entry?.review ? (
            <button onClick={() => { setText(entry.review ?? ''); setEditing(true); }} className="text-left w-full">
              {entry.rating != null ? <Stars value={entry.rating} /> : null}
              <p className="text-[14px] leading-relaxed text-ink-0 mt-1 whitespace-pre-line">{entry.review}</p>
              <div className="text-[11px] text-lb-blue font-semibold mt-2">Edit</div>
            </button>
          ) : (
            <button onClick={() => { setText(''); setEditing(true); }} className="w-full py-2.5 rounded-xl bg-bg-2 text-sm font-semibold text-ink-1">
              Write a review
            </button>
          )}
        </div>
      ) : null}

      {friends.length ? (
        <div>
          <div className="flex items-baseline justify-between mb-2">
            <div className="text-[10px] uppercase tracking-[0.14em] text-ink-2 font-semibold">Friends</div>
            {friendAvg.length ? (
              <div className="text-xs text-ink-1">
                avg <span className="text-lb-orange">★</span>{' '}
                {(friendAvg.reduce((s, f) => s + (f.rating ?? 0), 0) / friendAvg.length).toFixed(1)}
              </div>
            ) : null}
          </div>
          <div className="space-y-2">
            {friends.map((f) => {
              const p = profileById(f.userId);
              if (!p) return null;
              return (
                <button key={f.userId} onClick={() => a.openUser(f.userId)} className="w-full text-left rounded-xl bg-bg-1 p-3 flex gap-3">
                  <FriendDot profile={p} size={30} />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-semibold">{p.username}</span>
                      {f.rating != null ? <span className="stars text-[12px]">{starsOf(f.rating)}</span> : null}
                    </div>
                    {f.review ? <p className="text-[13px] text-ink-1 leading-relaxed mt-1 whitespace-pre-line">{f.review}</p> : null}
                  </div>
                  <span className="text-[10px] text-ink-2 flex-shrink-0">{relTime(f.updatedAt)}</span>
                </button>
              );
            })}
          </div>
        </div>
      ) : null}

      {critics.length ? (
        <div>
          <div className="text-[10px] uppercase tracking-[0.14em] text-ink-2 font-semibold mb-2">
            Critics{detail?.criticScore != null ? ` · ${detail.criticScore.toFixed(1)}/10` : ''}
          </div>
          <div className="space-y-2">
            {critics.slice(0, showCritics).map((r, i) => (
              <ReviewCard key={i} r={r} />
            ))}
          </div>
          {critics.length > showCritics ? (
            <button onClick={() => setShowCritics((n) => n + 20)} className="w-full mt-2 py-2 rounded-xl bg-bg-1 text-xs font-semibold text-ink-1">
              {critics.length - showCritics} more critic reviews
            </button>
          ) : null}
        </div>
      ) : null}

      <div>
        <div className="text-[10px] uppercase tracking-[0.14em] text-ink-2 font-semibold mb-2">Community</div>
        {!detail || (loading && !community.length) ? (
          <div className="space-y-2">
            <div className="h-16 rounded-xl skeleton" />
            <div className="h-16 rounded-xl skeleton" />
          </div>
        ) : community.length ? (
          <>
            <div className="space-y-2">
              {community.slice(0, showCommunity).map((r, i) => (
                <ReviewCard key={i} r={r} />
              ))}
            </div>
            {community.length > showCommunity ? (
              <button onClick={() => setShowCommunity((n) => n + 20)} className="w-full mt-2 py-2 rounded-xl bg-bg-1 text-xs font-semibold text-ink-1">
                {community.length - showCommunity} more reader reviews
              </button>
            ) : null}
          </>
        ) : (
          <div className="text-xs text-ink-2 py-3">No reader reviews yet.</div>
        )}
        {detail?.reviewsUrl ? (
          <a href={detail.reviewsUrl} target="_blank" rel="noreferrer" className="block text-center text-[11px] text-ink-2 pt-3">
            Reviews from Comic Book Roundup ↗
          </a>
        ) : null}
      </div>
    </div>
  );
}

function ReviewCard({ r }: { r: Review }) {
  const [open, setOpen] = useState(false);
  const long = r.text.length > 260;
  return (
    <div className="rounded-xl bg-bg-1 p-3">
      <div className="flex items-center gap-2">
        {r.avatar ? <img src={r.avatar} alt="" className="w-6 h-6 rounded-full object-cover bg-bg-2 flex-shrink-0" referrerPolicy="no-referrer" /> : null}
        <div className="min-w-0">
          <div className="text-[13px] font-semibold truncate leading-tight">{r.user ?? r.source}</div>
          {r.critic && r.source && r.source !== r.user ? <div className="text-[10px] text-ink-2 truncate">{r.source}</div> : null}
        </div>
        {r.rating != null ? <span className="stars text-[12px] flex-shrink-0">{starsOf(r.rating)}</span> : null}
        <span className="flex-1" />
        {r.date ? <span className="text-[10px] text-ink-2 flex-shrink-0">{shortDate(r.date)}</span> : null}
      </div>
      {r.text ? (
        <p className={`text-[13px] text-ink-1 leading-relaxed mt-1.5 whitespace-pre-line ${open || !long ? '' : 'line-clamp-5'}`}>{r.text}</p>
      ) : null}
      <div className="flex items-center gap-3 mt-1.5">
        {long ? (
          <button onClick={() => setOpen((o) => !o)} className="text-[11px] font-semibold text-lb-blue">
            {open ? 'Less' : 'More'}
          </button>
        ) : null}
        {r.url ? (
          <a href={r.url} target="_blank" rel="noreferrer" className="text-[11px] text-ink-2">
            {r.critic ? 'Read review ↗' : `on ${r.source} ↗`}
          </a>
        ) : null}
      </div>
    </div>
  );
}

function Zoom({ src, title, comicId, variant, onClose }: { src: string | null; title: string; comicId: string; variant?: Variant; onClose: () => void }) {
  useBackLayer(onClose);
  const a = useActions();
  const mine = !!variant?.custom && !!a.selfId && variant.by === a.selfId;
  const remove = async () => {
    if (!variant) return;
    try {
      await removeCustomCover(comicId, variant);
      const e = collection.entry(comicId);
      if (e?.variants.some((x) => x.id === variant.id)) await collection.patch(e.meta, { variants: e.variants.filter((x) => x.id !== variant.id), owned: true });
      coversChanged.emit(comicId);
      toast('Photo removed');
      onClose();
    } catch (err) {
      toast((err as Error).message, 'error');
    }
  };
  return (
    <div className="fixed inset-0 z-50 bg-black/95 flex flex-col items-center justify-center p-4 fade-in" onClick={onClose}>
      <img src={src ?? ''} alt={title} referrerPolicy="no-referrer" className="max-w-full max-h-[80vh] rounded-lg shadow-2xl object-contain pop-in" />
      <div className="text-sm text-ink-1 mt-4 text-center px-6">{title}</div>
      {variant?.custom ? <div className="text-[11px] text-ink-2 mt-1">Collector photo{mine ? ' · added by you' : ''}</div> : null}
      {mine ? (
        <button
          onClick={(e) => {
            e.stopPropagation();
            void remove();
          }}
          className="mt-4 px-4 py-2 rounded-xl bg-white/10 text-sm font-semibold text-red-300"
        >
          Remove my photo
        </button>
      ) : null}
    </div>
  );
}

function HeroSkeleton() {
  return (
    <div className="pt-[calc(env(safe-area-inset-top)+64px)] px-4">
      <div className="mx-auto w-[54%] max-w-[240px] aspect-[2/3] rounded-xl skeleton" />
      <div className="h-6 w-3/4 mx-auto rounded skeleton mt-6" />
      <div className="h-3 w-1/2 mx-auto rounded skeleton mt-3" />
    </div>
  );
}

function groupCreators(list: { name: string; role: string }[]): [string, string[]][] {
  const order = ['Writer', 'Artist', 'Penciller', 'Inker', 'Colorist', 'Letterer', 'Cover Artist', 'Editor'];
  const m = new Map<string, string[]>();
  for (const c of list) {
    const role = c.role || 'Creator';
    const names = m.get(role) ?? [];
    if (!names.includes(c.name)) names.push(c.name);
    m.set(role, names);
  }
  return [...m.entries()].sort((a, b) => {
    const ia = order.indexOf(a[0]);
    const ib = order.indexOf(b[0]);
    return (ia < 0 ? 99 : ia) - (ib < 0 ? 99 : ib);
  });
}

function sourceName(url: string): string {
  try {
    const h = new URL(url).hostname.replace(/^www\./, '');
    if (h.includes('leagueofcomicgeeks')) return 'League of Comic Geeks';
    if (h.includes('metron')) return 'Metron';
    if (h.includes('comicvine')) return 'Comic Vine';
    return h;
  } catch {
    return 'source';
  }
}
