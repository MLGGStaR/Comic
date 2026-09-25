// My Comics: the three shelves up top (Comics · Read · Wishlist), the
// portfolio card, a quick stats strip, and the + button for adding comics.
import { useMemo } from 'react';
import { useActions } from '../state/actions';
import { useCollection } from '../state/collection';
import type { Entry } from '../types';
import type { Shelf } from '../state/nav';
import { portfolio } from '../lib/shelf';
import { fmtMoney } from '../lib/format';
import { Cover } from '../ui/Cover';
import { Icon } from '../ui/Icon';
import { SectionHeader, Row, Empty } from '../ui/layout';
import { ComicTile } from '../ui/ComicTile';
import { ValueSparkline, useValueHistory } from '../ui/ValueSparkline';

export function MyComicsView() {
  const a = useActions();
  const { entries, loaded, userId } = useCollection();

  const list = useMemo(() => [...entries.values()], [entries]);
  const shelves = useMemo(() => splitShelves(list), [list]);
  const p = useMemo(() => portfolio(list), [list]);
  const history = useValueHistory(userId);

  if (!a.selfId) {
    return (
      <Empty title="Your comics live here">
        Log in to track what you own, what you've read and what you want — and see what it's all worth.
      </Empty>
    );
  }

  const gain = p.paid > 0 ? p.total - p.paid : null;

  return (
    <div className="space-y-7 relative">
      <section>
        <div className="grid grid-cols-3 gap-2.5">
          <ShelfTile shelf="owned" label="Comics" entries={shelves.owned} />
          <ShelfTile shelf="read" label="Read" entries={shelves.read} />
          <ShelfTile shelf="wishlist" label="Wishlist" entries={shelves.wishlist} />
        </div>
      </section>

      <section>
        <button
          onClick={() => a.openPortfolio(a.selfId!)}
          className="w-full text-left rounded-3xl p-5 border border-white/[0.07] relative overflow-hidden press"
          style={{
            background:
              'radial-gradient(120% 90% at 100% 0%, rgba(0,215,53,0.16), transparent 60%), radial-gradient(90% 80% at 0% 100%, rgba(64,188,244,0.12), transparent 60%), #262f43',
          }}
        >
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="text-[10px] uppercase tracking-[0.16em] text-ink-2 font-semibold">Portfolio · est. value</div>
              <div className="font-display text-[40px] font-extrabold leading-none tracking-tight mt-2">
                {loaded ? fmtMoney(p.total, { compact: true }) : '—'}
              </div>
              <div className="text-xs text-ink-1 mt-2">
                {p.owned} comic{p.owned === 1 ? '' : 's'}
                {gain != null ? (
                  <span className={gain >= 0 ? 'text-lb-green' : 'text-red-400'}>
                    {' '}
                    · {gain >= 0 ? '+' : '−'}
                    {fmtMoney(Math.abs(gain), { compact: true })} vs paid
                  </span>
                ) : null}
              </div>
            </div>
            <Icon name="chevron-right" size={20} className="text-ink-2 mt-1 flex-shrink-0" />
          </div>
          {history.length > 1 ? (
            <div className="mt-4 -mx-1">
              <ValueSparkline points={history} height={46} />
            </div>
          ) : null}
        </button>
      </section>

      {shelves.recent.length ? (
        <section>
          <SectionHeader>Recently added</SectionHeader>
          <Row>
            {shelves.recent.map((e) => (
              <ComicTile key={e.comicId} comic={e.meta} width={96} stars={e.rating} />
            ))}
          </Row>
        </section>
      ) : null}

      <section>
        <button
          onClick={() => a.openStats(a.selfId!)}
          className="w-full flex items-center gap-3 p-4 rounded-2xl bg-bg-1 border border-white/[0.06] press"
        >
          <span className="w-10 h-10 rounded-xl bg-lb-blue/15 text-lb-blue flex items-center justify-center">
            <Icon name="trend" size={20} />
          </span>
          <span className="flex-1 text-left">
            <span className="block text-sm font-semibold">Stats</span>
            <span className="block text-xs text-ink-2">
              {shelves.readThisYear} read this year{shelves.avgRating ? ` · avg ${shelves.avgRating.toFixed(1)}★` : ''}
            </span>
          </span>
          <Icon name="chevron-right" size={18} className="text-ink-2" />
        </button>
      </section>

      {loaded && !list.length ? (
        <div className="card text-center py-8">
          <div className="text-sm font-semibold mb-1">Start your longbox</div>
          <p className="text-xs text-ink-2 mb-4">Scan a cover or barcode, or search for a comic you have.</p>
          <button onClick={a.openAdd} className="btn-primary">
            Add comics
          </button>
        </div>
      ) : null}

      <AddFab />
    </div>
  );
}

export function AddFab() {
  const a = useActions();
  return (
    <button
      onClick={() => (a.requireLogin() ? a.openAdd() : undefined)}
      aria-label="Add comics"
      className="fixed right-5 z-30 w-14 h-14 rounded-full text-bg-0 flex items-center justify-center shadow-[0_10px_30px_rgba(0,215,53,0.35)]"
      style={{
        bottom: 'calc(96px + env(safe-area-inset-bottom))',
        background: 'linear-gradient(135deg, #00d735 0%, #2fc7a0 100%)',
      }}
    >
      <Icon name="plus" size={28} strokeWidth={2.6} />
    </button>
  );
}

function splitShelves(list: Entry[]) {
  const byAdded = [...list].sort((a, b) => b.addedAt.localeCompare(a.addedAt));
  const owned = byAdded.filter((e) => e.owned);
  const read = [...list].filter((e) => e.read).sort((a, b) => (b.readAt ?? '').localeCompare(a.readAt ?? ''));
  const wishlist = byAdded.filter((e) => e.wishlist);
  const year = String(new Date().getFullYear());
  const rated = read.filter((e) => e.rating != null);
  return {
    owned,
    read,
    wishlist,
    recent: byAdded.slice(0, 15),
    readThisYear: read.filter((e) => (e.readAt ?? '').startsWith(year)).length,
    avgRating: rated.length ? rated.reduce((s, e) => s + (e.rating ?? 0), 0) / rated.length : 0,
  };
}

function ShelfTile({ shelf, label, entries }: { shelf: Shelf; label: string; entries: Entry[] }) {
  const a = useActions();
  const tone = shelf === 'owned' ? 'text-lb-green' : shelf === 'read' ? 'text-lb-blue' : 'text-lb-orange';
  const covers = entries.slice(0, 3);
  return (
    <button
      onClick={() => a.openShelf(shelf, a.selfId!)}
      className="rounded-2xl bg-bg-1 border border-white/[0.06] pt-3 pb-2.5 px-2 text-center press"
      aria-label={`${label}, ${entries.length}`}
    >
      <div className="relative h-[92px] mx-auto w-full">
        {covers.length ? (
          covers.map((e, i) => {
            const n = covers.length;
            const offset = (i - (n - 1) / 2) * 18;
            const rot = (i - (n - 1) / 2) * 7;
            return (
              <div
                key={e.comicId}
                className="absolute top-1 left-1/2 w-[58px] aspect-[2/3] rounded-md overflow-hidden bg-bg-2 shadow-[0_6px_14px_rgba(0,0,0,0.45)] border border-black/20"
                style={{
                  transform: `translateX(calc(-50% + ${offset}px)) rotate(${rot}deg)`,
                  zIndex: i === Math.floor(n / 2) ? 3 : 1 + i,
                }}
              >
                <Cover src={e.meta.cover} alt={e.meta.title} className="w-full h-full" />
              </div>
            );
          })
        ) : (
          <div className="absolute top-1 left-1/2 -translate-x-1/2 w-[58px] aspect-[2/3] rounded-md border border-dashed border-white/15 flex items-center justify-center text-ink-2">
            <Icon name={shelf === 'owned' ? 'box' : shelf === 'read' ? 'book' : 'bookmark'} size={20} />
          </div>
        )}
      </div>
      <div className={`font-display text-[22px] font-extrabold leading-none mt-1 ${tone}`}>{entries.length}</div>
      <div className="text-[11px] font-semibold text-ink-1 mt-1">{label}</div>
    </button>
  );
}
