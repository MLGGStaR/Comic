// Search: type "absolute batman #2" or "saga vol 1" → the one comic you
// meant, big, with the few genuinely different matches as small rows under
// it. Variants and reprints are folded away.
import { useEffect, useMemo, useRef, useState } from 'react';
import { api } from '../api/client';
import { useActions } from '../state/actions';
import type { ComicLite, SearchHit, SearchResult } from '../types';
import { Cover } from '../ui/Cover';
import { Icon } from '../ui/Icon';
import { SectionHeader, Empty } from '../ui/layout';
import { ComicTile, StatusBadge } from '../ui/ComicTile';
import { StatusToggles } from '../ui/StatusToggles';
import { usePress } from '../ui/press';
import { useEntry } from '../state/collection';
import { fmtDate, fmtMoney } from '../lib/format';
import { parseQuery } from '../lib/query';
import { isoDay } from '../lib/entry';
import { weekStart } from '../lib/dates';

const RECENT_KEY = 'lbx-recent-searches';
const EDITION_LABEL = { tp: 'Trade paperback', hc: 'Hardcover', omnibus: 'Omnibus', deluxe: 'Deluxe edition' } as const;
const loadRecent = (): string[] => {
  try {
    return JSON.parse(localStorage.getItem(RECENT_KEY) ?? '[]');
  } catch {
    return [];
  }
};

export function SearchView() {
  const a = useActions();
  const [q, setQ] = useState(() => sessionStorage.getItem('lbx-q') ?? '');
  const [res, setRes] = useState<SearchResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [recent, setRecent] = useState<string[]>(loadRecent);
  const seq = useRef(0);

  useEffect(() => sessionStorage.setItem('lbx-q', q), [q]);

  useEffect(() => {
    const query = q.trim();
    if (query.length < 2) {
      setRes(null);
      setErr(null);
      setBusy(false);
      return;
    }
    const my = ++seq.current;
    setBusy(true);
    setErr(null);
    const t = window.setTimeout(async () => {
      try {
        const r = await api.search(query);
        if (seq.current !== my) return;
        setRes(r);
        // warm the top comic's page so tapping it opens instantly
        if (r.top?.kind === 'comic') void api.comic(r.top.comic).catch(() => {});
        if (r.top) {
          const next = [query, ...loadRecent().filter((x) => x.toLowerCase() !== query.toLowerCase())].slice(0, 8);
          localStorage.setItem(RECENT_KEY, JSON.stringify(next));
          setRecent(next);
        }
      } catch (e) {
        if (seq.current === my) setErr((e as Error).message);
      } finally {
        if (seq.current === my) setBusy(false);
      }
    }, 450);
    return () => window.clearTimeout(t);
  }, [q]);

  const parsed = useMemo(() => (q.trim().length >= 2 ? parseQuery(q) : null), [q]);

  return (
    <div className="space-y-6">
      <div className="flex gap-2 items-center sticky top-[calc(env(safe-area-inset-top)+52px)] z-10 -mx-3 px-3 py-1 bg-bg-0/95 backdrop-blur">
        <div className="flex-1 relative">
          <Icon name="search" size={18} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-ink-2" />
          <input
            id="search-input"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="absolute batman #2"
            enterKeyHint="search"
            autoCorrect="off"
            autoCapitalize="off"
            spellCheck={false}
            onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
            className="w-full bg-bg-1 border border-white/[0.06] rounded-2xl pl-10 pr-10 py-3 text-[16px] focus:outline-none focus:border-lb-blue/60 placeholder:text-ink-2"
          />
          {q ? (
            <button
              onClick={() => setQ('')}
              aria-label="Clear"
              className="absolute right-2 top-1/2 -translate-y-1/2 p-1.5 rounded-full text-ink-2 active:bg-bg-2"
            >
              <Icon name="close" size={16} />
            </button>
          ) : null}
        </div>
        <button
          onClick={() => (a.requireLogin() ? a.openAdd() : undefined)}
          aria-label="Scan or add"
          className="w-12 h-12 rounded-2xl flex items-center justify-center text-bg-0 flex-shrink-0 shadow-[0_6px_18px_rgba(0,215,53,0.3)]"
          style={{ background: 'linear-gradient(135deg, #00d735 0%, #2fc7a0 100%)' }}
        >
          <Icon name="plus" size={24} strokeWidth={2.6} />
        </button>
      </div>

      {parsed && q.trim().length >= 2 ? (
        <div className="-mt-3 px-1 text-[11px] text-ink-2">
          {parsed.kind === 'issue'
            ? `Issue #${parsed.issue} of “${parsed.series}”`
            : parsed.kind === 'collection'
            ? ['Collected edition', parsed.volume != null ? `Vol. ${parsed.volume}` : null, parsed.edition ? EDITION_LABEL[parsed.edition] : null].filter(Boolean).join(' · ')
            : 'Series'}
          {parsed.year ? ` · ${parsed.year}` : ''}
        </div>
      ) : null}

      {q.trim().length < 2 ? (
        <Idle recent={recent} onPick={setQ} onClear={() => {
          localStorage.removeItem(RECENT_KEY);
          setRecent([]);
        }} />
      ) : busy && !res ? (
        <TopSkeleton />
      ) : err && !res ? (
        <Empty title="Search is having a moment">
          {err}
          <br />
          <button onClick={() => setQ((x) => `${x} `)} className="mt-3 text-lb-blue font-semibold">
            Try again
          </button>
        </Empty>
      ) : res ? (
        <div className={busy ? 'opacity-60 transition-opacity' : 'transition-opacity'}>
          {res.top ? (
            <TopResult hit={res.top} />
          ) : (
            <Empty title="No match">Try the series name plus an issue number, like “saga #1”, or “vol 1” for a trade.</Empty>
          )}
          {res.more.length ? (
            <div className="mt-5 space-y-1.5 fade-in">
              {res.more.map((h) => (
                <MoreRow key={hitKey(h)} hit={h} />
              ))}
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

const hitKey = (h: SearchHit) => (h.kind === 'comic' ? `c:${h.comic.id}` : `s:${h.series.id}`);

function TopResult({ hit }: { hit: SearchHit }) {
  const a = useActions();
  if (hit.kind === 'series') {
    const s = hit.series;
    return (
      <button onClick={() => a.openSeries(s.id, s.title)} className="w-full text-left card !p-4 flex gap-4 press pop-in">
        <div className="cover w-28 aspect-[2/3] rounded-lg overflow-hidden bg-bg-2 flex-shrink-0 shadow-[0_8px_24px_rgba(0,0,0,0.45)]">
          <Cover src={s.cover} alt={s.title} className="w-full h-full" eager />
        </div>
        <div className="min-w-0 flex-1 py-1">
          <div className="text-[10px] uppercase tracking-[0.16em] text-lb-blue font-bold">Series</div>
          <div className="font-display text-[22px] font-extrabold leading-tight mt-1">{s.title}</div>
          <div className="text-xs text-ink-2 mt-1.5">{[s.publisher, s.years].filter(Boolean).join(' · ')}</div>
          {s.count ? <div className="text-xs text-ink-1 mt-1">{s.count} issues</div> : null}
          <div className="text-xs text-lb-green font-semibold mt-3 flex items-center gap-1">
            All issues <Icon name="chevron-right" size={14} />
          </div>
        </div>
      </button>
    );
  }
  return <TopComic comic={hit.comic} />;
}

function TopComic({ comic }: { comic: ComicLite }) {
  const a = useActions();
  const press = usePress(
    () => a.openComic(comic),
    () => a.quickLog(comic),
  );
  const soon = comic.releaseDate && comic.releaseDate > isoDay(new Date());
  return (
    <div className="card !p-4 pop-in">
      <button {...press} className="w-full text-left flex gap-4">
        <div className="cover relative w-28 aspect-[2/3] rounded-lg overflow-hidden bg-bg-2 flex-shrink-0 shadow-[0_8px_24px_rgba(0,0,0,0.45)]">
          <Cover src={comic.cover} alt={comic.title} className="w-full h-full" eager />
        </div>
        <div className="min-w-0 flex-1 py-1">
          <div className={`text-[10px] uppercase tracking-[0.16em] font-bold ${comic.format === 'collection' ? 'text-lb-orange' : 'text-lb-green'}`}>
            {comic.format === 'collection' ? comic.formatLabel ?? 'Collected edition' : 'Issue'}
            {soon ? <span className="text-lb-blue"> · coming {fmtDate(comic.releaseDate)}</span> : null}
          </div>
          <div className="font-display text-[21px] font-extrabold leading-tight mt-1 line-clamp-3">{comic.title}</div>
          <div className="text-xs text-ink-2 mt-1.5">
            {[comic.publisher, soon ? null : fmtDate(comic.releaseDate, { year: true }), comic.price != null ? fmtMoney(comic.price, { cents: true }) : null]
              .filter(Boolean)
              .join(' · ')}
          </div>
          {comic.rating != null ? (
            <div className="text-xs text-ink-1 mt-1">
              <span className="text-lb-orange">★</span> {comic.rating.toFixed(1)}
              {comic.pulls ? <span className="text-ink-2"> · {compact(comic.pulls)} pulls</span> : null}
            </div>
          ) : null}
          <div className="text-xs text-lb-green font-semibold mt-3 flex items-center gap-1">
            Details <Icon name="chevron-right" size={14} />
          </div>
        </div>
      </button>
      <div className="mt-4">
        <StatusToggles comic={comic} />
      </div>
    </div>
  );
}

function MoreRow({ hit }: { hit: SearchHit }) {
  const a = useActions();
  const c = hit.kind === 'comic' ? hit.comic : null;
  const s = hit.kind === 'series' ? hit.series : null;
  const entry = useEntry(c?.id);
  const press = usePress(
    () => (c ? a.openComic(c) : a.openSeries(s!.id, s!.title)),
    c ? () => a.quickLog(c) : undefined,
  );
  return (
    <button
      {...press}
      onPointerDown={(e) => {
        // start loading the page as the finger lands, not when it lifts
        if (c) void api.comic(c).catch(() => {});
        press.onPointerDown(e);
      }}
      className="w-full flex items-center gap-3 p-2 rounded-xl active:bg-bg-1 text-left"
    >
      <div className="relative w-11 aspect-[2/3] rounded overflow-hidden bg-bg-2 flex-shrink-0">
        <Cover src={c?.cover ?? s?.cover} alt={c?.title ?? s!.title} className="w-full h-full" />
        {entry ? <StatusBadge owned={entry.owned} read={entry.read} wishlist={entry.wishlist} /> : null}
      </div>
      <div className="min-w-0 flex-1">
        <div className="text-sm font-semibold truncate">{c?.title ?? s!.title}</div>
        <div className="text-[11px] text-ink-2 truncate">
          {c
            ? [c.format === 'collection' ? c.formatLabel ?? 'Collected' : null, c.publisher, fmtDate(c.releaseDate, { year: true })].filter(Boolean).join(' · ')
            : ['Series', s!.publisher, s!.years].filter(Boolean).join(' · ')}
        </div>
      </div>
      <Icon name="chevron-right" size={16} className="text-ink-2" />
    </button>
  );
}

function Idle({ recent, onPick, onClear }: { recent: string[]; onPick: (q: string) => void; onClear: () => void }) {
  const [hot, setHot] = useState<ComicLite[]>([]);
  useEffect(() => {
    let alive = true;
    api
      .week(weekStart(new Date()))
      .then((list) => {
        if (alive) setHot([...list].filter((c) => c.format === 'issue').sort((x, y) => (y.pulls ?? 0) - (x.pulls ?? 0)).slice(0, 12));
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, []);
  return (
    <div className="space-y-7">
      {recent.length ? (
        <section>
          <SectionHeader
            action={
              <button onClick={onClear} className="text-[11px] text-ink-2">
                Clear
              </button>
            }
          >
            Recent
          </SectionHeader>
          <div className="flex flex-wrap gap-2">
            {recent.map((r) => (
              <button key={r} onClick={() => onPick(r)} className="px-3 py-1.5 rounded-full bg-bg-1 text-[13px] text-ink-1">
                {r}
              </button>
            ))}
          </div>
        </section>
      ) : (
        <div className="text-xs text-ink-2 leading-relaxed px-1">
          Search a series and issue — <b className="text-ink-1">absolute batman #2</b> — or a trade —{' '}
          <b className="text-ink-1">absolute batman vol 1</b>. Hold a cover to log it fast.
        </div>
      )}
      {hot.length ? (
        <section>
          <SectionHeader>Hot this week</SectionHeader>
          <div className="grid grid-cols-4 gap-2">
            {hot.map((c) => (
              <ComicTile key={c.id} comic={c} showStatus />
            ))}
          </div>
        </section>
      ) : null}
    </div>
  );
}

function TopSkeleton() {
  return (
    <div className="card !p-4 flex gap-4">
      <div className="w-28 aspect-[2/3] rounded-lg skeleton" />
      <div className="flex-1 space-y-2 py-2">
        <div className="h-3 w-16 rounded skeleton" />
        <div className="h-6 w-4/5 rounded skeleton" />
        <div className="h-3 w-1/2 rounded skeleton" />
      </div>
    </div>
  );
}

export function compact(n: number): string {
  if (n >= 1e6) return `${(n / 1e6).toFixed(1)}m`;
  if (n >= 1e3) return `${(n / 1e3).toFixed(n >= 1e4 ? 0 : 1)}k`;
  return String(n);
}
