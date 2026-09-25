// The comic page: big cover over a blurred backdrop, Have / Read / Wishlist,
// your rating, then tabs — Overview, Variants (log each cover you own) and
// Reviews (friends first, then the community and critics).
import { useEffect, useMemo, useRef, useState } from 'react';
import { api } from '../api/client';
import type { ComicDetail, ComicLite, Variant, Review } from '../types';
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
import { fmtDate, fmtMoney, relTime } from '../lib/format';
import { isoDay } from '../lib/entry';
import { valueOf } from '../lib/shelf';
import { useBackLayer } from '../lib/backstack';
import { toast } from '../ui/toast';
import { compact } from '../views/Search';

type Tab = 'overview' | 'variants' | 'reviews';

export function ComicScreen({ id, seed, onClose }: { id: string; seed?: ComicLite; onClose: () => void }) {
  const [detail, setDetail] = useState<ComicDetail | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>('overview');
  const [zoom, setZoom] = useState<{ src: string | null; title: string } | null>(null);
  const entry = useEntry(id);
  const a = useActions();

  useEffect(() => {
    let alive = true;
    setErr(null);
    api.swr<ComicDetail>('comic', { id }, 12 * 3600e3, (d) => alive && setDetail(d)).catch((e: Error) => alive && setErr(e.message));
    return () => {
      alive = false;
    };
  }, [id]);

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
              <Variants comic={lite} detail={detail} onZoom={(v) => setZoom({ src: v.cover, title: v.name })} />
            ) : (
              <Reviews comic={lite} detail={detail} />
            )}
          </div>
        </>
      ) : null}
      {zoom ? <Zoom src={zoom.src} title={zoom.title} onClose={() => setZoom(null)} /> : null}
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

function Hero({ comic, detail, onZoom }: { comic: ComicLite; detail: ComicDetail | null; onZoom: () => void }) {
  const src = detail?.cover ?? comic.cover;
  return (
    <div className="relative pt-[calc(env(safe-area-inset-top)+64px)] pb-6 overflow-hidden">
      {src ? (
        <div className="absolute inset-0 -z-0">
          <img src={src} alt="" referrerPolicy="no-referrer" className="w-full h-full object-cover scale-125 blur-2xl opacity-45" />
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
      {detail?.rating != null || detail?.criticScore != null || comic.pulls ? (
        <div className="flex justify-center gap-4 mt-3 text-xs">
          {detail?.rating != null ? (
            <span className="text-ink-1">
              <span className="text-lb-orange">★</span> <b className="text-ink-0">{detail.rating.toFixed(1)}</b>
              {detail.ratingCount ? <span className="text-ink-2"> ({compact(detail.ratingCount)})</span> : null}
            </span>
          ) : null}
          {detail?.criticScore != null ? (
            <span className="text-ink-1">
              Critics <b className="text-ink-0">{detail.criticScore.toFixed(1)}</b>
              <span className="text-ink-2">/10</span>
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

      <YourCopy comic={comic} />

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

      {detail.prevId || detail.nextId ? (
        <div className="grid grid-cols-2 gap-2">
          <button
            disabled={!detail.prevId}
            onClick={() => detail.prevId && a.openComicId(detail.prevId)}
            className="py-2.5 rounded-xl bg-bg-1 text-xs font-semibold text-ink-1 disabled:opacity-30 flex items-center justify-center gap-1"
          >
            <Icon name="chevron-left" size={14} /> Previous issue
          </button>
          <button
            disabled={!detail.nextId}
            onClick={() => detail.nextId && a.openComicId(detail.nextId)}
            className="py-2.5 rounded-xl bg-bg-1 text-xs font-semibold text-ink-1 disabled:opacity-30 flex items-center justify-center gap-1"
          >
            Next issue <Icon name="chevron-right" size={14} />
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

function YourCopy({ comic }: { comic: ComicLite }) {
  const entry = useEntry(comic.id);
  const [edit, setEdit] = useState(false);
  const [paid, setPaid] = useState('');
  const [value, setValue] = useState('');
  const [est, setEst] = useState<{ raw: number | null; source: string; sales?: number | null } | null>(null);
  useEffect(() => {
    if (!entry?.owned) return;
    let alive = true;
    api
      .price(comic.id)
      .then((p) => {
        if (!alive) return;
        setEst(p);
        if (p.raw != null && entry.est == null && !entry.variants.length) void collection.patch(comic, { est: p.raw });
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [comic.id, entry?.owned]);
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
            {v.basis === 'yours' ? 'your value' : v.basis === 'market' ? `market estimate${est?.source ? ` · ${est.source}` : ''}` : v.basis === 'cover' ? 'at cover price' : 'no value yet'}
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
    </div>
  );
}

function Variants({ comic, detail, onZoom }: { comic: ComicLite; detail: ComicDetail | null; onZoom: (v: Variant) => void }) {
  const entry = useEntry(comic.id);
  const a = useActions();
  if (!detail) return <div className="grid grid-cols-3 gap-2">{Array.from({ length: 6 }).map((_, i) => <div key={i} className="aspect-[2/3] rounded-lg skeleton" />)}</div>;
  const main: Variant = { id: comic.id, name: 'Main cover', cover: detail.cover ?? comic.cover, price: detail.price };
  const all = [main, ...detail.variants];
  const ownedIds = new Set(entry?.variants.map((v) => v.id) ?? []);
  const implicitMain = !!entry?.owned && ownedIds.size === 0;
  const isOwned = (v: Variant) => ownedIds.has(v.id) || (implicitMain && v.id === main.id);

  const toggle = (v: Variant) => {
    if (!a.requireLogin()) return;
    navigator.vibrate?.(8);
    let cur = entry?.variants ?? [];
    if (implicitMain) cur = [{ id: main.id, name: main.name, cover: main.cover }];
    const has = cur.some((x) => x.id === v.id);
    const next = has ? cur.filter((x) => x.id !== v.id) : [...cur, { id: v.id, name: v.name, cover: v.cover }];
    if (!next.length) void collection.patch(comic, { owned: false });
    else void collection.patch(comic, { variants: next });
    toast(has ? `Removed ${v.name}` : `Logged ${v.name}`);
  };

  return (
    <div className="fade-in">
      <div className="text-xs text-ink-2 mb-3">
        {all.length} cover{all.length === 1 ? '' : 's'} · tap the circle to log the ones you own
        {ownedIds.size || implicitMain ? <span className="text-lb-green"> · you have {implicitMain ? 1 : ownedIds.size}</span> : null}
      </div>
      <div className="grid grid-cols-3 gap-2.5">
        {all.map((v) => {
          const own = isOwned(v);
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
                ) : null}
              </div>
              <div className="text-[10px] text-ink-1 mt-1 leading-tight line-clamp-2">{v.name}</div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function Reviews({ comic, detail }: { comic: ComicLite; detail: ComicDetail | null }) {
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
            {critics.map((r, i) => (
              <ReviewCard key={i} r={r} />
            ))}
          </div>
        </div>
      ) : null}

      <div>
        <div className="text-[10px] uppercase tracking-[0.14em] text-ink-2 font-semibold mb-2">Community</div>
        {!detail ? (
          <div className="space-y-2">
            <div className="h-16 rounded-xl skeleton" />
            <div className="h-16 rounded-xl skeleton" />
          </div>
        ) : community.length ? (
          <div className="space-y-2">
            {community.map((r, i) => (
              <ReviewCard key={i} r={r} />
            ))}
          </div>
        ) : (
          <div className="text-xs text-ink-2 py-3">No community reviews yet.</div>
        )}
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
        {r.avatar ? <img src={r.avatar} alt="" className="w-6 h-6 rounded-full object-cover bg-bg-2" referrerPolicy="no-referrer" /> : null}
        <span className="text-[13px] font-semibold truncate">{r.user ?? r.source}</span>
        {r.rating != null ? <span className="stars text-[12px]">{starsOf(r.rating)}</span> : null}
        <span className="flex-1" />
        {r.date ? <span className="text-[10px] text-ink-2">{fmtDate(r.date, { year: true })}</span> : null}
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

function Zoom({ src, title, onClose }: { src: string | null; title: string; onClose: () => void }) {
  useBackLayer(onClose);
  return (
    <div className="fixed inset-0 z-50 bg-black/95 flex flex-col items-center justify-center p-4 fade-in" onClick={onClose}>
      <img src={src ?? ''} alt={title} referrerPolicy="no-referrer" className="max-w-full max-h-[80vh] rounded-lg shadow-2xl object-contain pop-in" />
      <div className="text-sm text-ink-1 mt-4 text-center px-6">{title}</div>
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
