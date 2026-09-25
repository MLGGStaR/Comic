// A full shelf (Comics / Read / Wishlist) for you or a friend: search,
// sort, filter by publisher / year / format, rating histogram on Read.
import { useMemo, useState } from 'react';
import type { Shelf } from '../state/nav';
import type { Entry } from '../types';
import { Screen } from '../ui/Screen';
import { useUserEntries } from '../state/userEntries';
import { profileById, useProfiles } from '../state/profiles';
import { useActions } from '../state/actions';
import { shelfView, valueOf, type ShelfSort } from '../lib/shelf';
import { ComicTile } from '../ui/ComicTile';
import { RatingHistogram } from '../ui/RatingHistogram';
import { Empty } from '../ui/layout';
import { fmtMoney, fmtDate } from '../lib/format';
import { Icon } from '../ui/Icon';
import { useGenres, genresOf } from '../state/genres';

const TITLES: Record<Shelf, string> = { owned: 'Comics', read: 'Read', wishlist: 'Wishlist' };
const SORTS: Record<Shelf, [ShelfSort, string][]> = {
  owned: [
    ['added', 'Recently added'],
    ['series', 'Series A→Z'],
    ['release', 'Release date'],
    ['value', 'Value'],
    ['rating', 'Rating'],
  ],
  read: [
    ['read', 'Recently read'],
    ['rating', 'Rating'],
    ['series', 'Series A→Z'],
    ['release', 'Release date'],
  ],
  wishlist: [
    ['added', 'Recently added'],
    ['release', 'Release date'],
    ['series', 'Series A→Z'],
    ['price', 'Cover price'],
  ],
};

const select = 'min-w-0 bg-bg-1 rounded-xl px-3 py-2 text-[13px] font-semibold';

export function ShelfScreen({ shelf, userId, onClose }: { shelf: Shelf; userId: string; onClose: () => void }) {
  useProfiles();
  const a = useActions();
  const { entries, loading } = useUserEntries(userId);
  const isSelf = a.selfId === userId;
  const who = isSelf ? null : profileById(userId)?.username;

  const [sort, setSort] = useState<ShelfSort>(SORTS[shelf][0][0]);
  const [q, setQ] = useState('');
  const [publisher, setPublisher] = useState('');
  const [year, setYear] = useState<number | ''>('');
  const [format, setFormat] = useState<'' | 'issue' | 'collection'>('');
  const [rating, setRating] = useState<number | 'any'>('any');
  const [genre, setGenre] = useState('');
  const [showFilters, setShowFilters] = useState(false);

  const onShelf = useMemo(
    () => entries.filter((e) => (shelf === 'owned' ? e.owned : shelf === 'read' ? e.read : e.wishlist)),
    [entries, shelf],
  );
  const genreMap = useGenres(onShelf);
  const genreOf = useMemo(() => genresOf(genreMap), [genreMap]);
  const genres = useMemo(() => uniq(onShelf.flatMap(genreOf)).sort(), [onShelf, genreOf]);
  const publishers = useMemo(() => uniq(onShelf.map((e) => e.meta.publisher).filter(Boolean) as string[]).sort(), [onShelf]);
  const years = useMemo(
    () => uniq(onShelf.map((e) => Number((e.meta.releaseDate ?? '').slice(0, 4))).filter((y) => y > 0)).sort((x, y) => y - x),
    [onShelf],
  );

  const view = useMemo(
    () =>
      shelfView(entries, {
        shelf,
        sort,
        q,
        publisher: publisher || undefined,
        year: year || undefined,
        format: format || undefined,
        rating: rating === 'any' ? undefined : rating,
        genre: genre || undefined,
        genreOf,
      }),
    [entries, shelf, sort, q, publisher, year, format, rating, genre, genreOf],
  );
  const activeFilters = [publisher, year, format, genre].filter(Boolean).length;
  const today = new Date().toISOString().slice(0, 10);

  return (
    <Screen onClose={onClose} title={who ? `${who} · ${TITLES[shelf]}` : TITLES[shelf]}>
      <div className="px-3 pb-24">
        <div className="flex items-end justify-between px-1 mb-3">
          <div>
            <div className="font-display text-[28px] font-extrabold leading-none">{TITLES[shelf]}</div>
            <div className="text-xs text-ink-2 mt-1.5">
              {onShelf.length} {onShelf.length === 1 ? 'comic' : 'comics'}
              {who ? ` · ${who}` : ''}
            </div>
          </div>
          {shelf === 'owned' ? (
            <div className="text-right">
              <div className="font-display text-lg font-extrabold text-lb-green leading-none">
                {fmtMoney(onShelf.reduce((s, e) => s + (valueOf(e).amount ?? 0), 0), { compact: true })}
              </div>
              <div className="text-[10px] uppercase tracking-[0.14em] text-ink-2 mt-1">est. value</div>
            </div>
          ) : null}
        </div>

        <div className="flex gap-2 mb-2">
          <div className="flex-1 min-w-0 relative">
            <Icon name="search" size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-2" />
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder={`Search ${TITLES[shelf].toLowerCase()}…`}
              enterKeyHint="search"
              className="w-full bg-bg-1 rounded-xl pl-9 pr-3 py-2 text-sm focus:outline-none placeholder:text-ink-2"
            />
          </div>
          <select value={sort} onChange={(e) => setSort(e.target.value as ShelfSort)} className={`${select} flex-shrink-0 max-w-[46%]`}>
            {SORTS[shelf].map(([k, label]) => (
              <option key={k} value={k}>
                {label}
              </option>
            ))}
          </select>
        </div>

        <button
          onClick={() => setShowFilters((v) => !v)}
          className={`mb-3 px-3 py-1.5 rounded-lg text-xs font-semibold inline-flex items-center gap-1 ${
            activeFilters ? 'bg-lb-green/15 text-lb-green' : 'bg-bg-1 text-ink-2'
          }`}
        >
          Filters{activeFilters ? ` · ${activeFilters}` : ''}
          <Icon name="chevron-down" size={14} className={showFilters ? 'rotate-180 transition-transform' : 'transition-transform'} />
        </button>
        {showFilters ? (
          <div className="grid grid-cols-2 gap-2 mb-3 fade-in">
            <select value={genre} onChange={(e) => setGenre(e.target.value)} className={`${select} ${genre ? 'text-lb-green' : ''}`}>
              <option value="">Genre</option>
              {genres.map((g) => (
                <option key={g} value={g}>
                  {g}
                </option>
              ))}
            </select>
            <select value={publisher} onChange={(e) => setPublisher(e.target.value)} className={`${select} ${publisher ? 'text-lb-green' : ''}`}>
              <option value="">Publisher</option>
              {publishers.map((p) => (
                <option key={p} value={p}>
                  {p}
                </option>
              ))}
            </select>
            <select
              value={year}
              onChange={(e) => setYear(e.target.value ? Number(e.target.value) : '')}
              className={`${select} ${year ? 'text-lb-green' : ''}`}
            >
              <option value="">Year</option>
              {years.map((y) => (
                <option key={y} value={y}>
                  {y}
                </option>
              ))}
            </select>
            <select
              value={format}
              onChange={(e) => setFormat(e.target.value as '' | 'issue' | 'collection')}
              className={`${select} ${format ? 'text-lb-green' : ''}`}
            >
              <option value="">Format</option>
              <option value="issue">Issues</option>
              <option value="collection">Collected</option>
            </select>
          </div>
        ) : null}

        {shelf === 'read' ? (
          <RatingHistogram countFor={(t) => onShelf.filter((e) => e.rating === t).length} active={rating} onSelect={setRating} />
        ) : null}

        {loading && !entries.length ? (
          <div className="grid grid-cols-4 gap-2">
            {Array.from({ length: 12 }).map((_, i) => (
              <div key={i} className="aspect-[2/3] rounded-lg skeleton" />
            ))}
          </div>
        ) : !view.length ? (
          <Empty title={onShelf.length ? 'Nothing matches' : `No ${TITLES[shelf].toLowerCase()} yet`}>
            {onShelf.length ? 'Try clearing the filters.' : isSelf ? 'Hold any cover to add it here.' : null}
          </Empty>
        ) : (
          <>
            <div className="text-[11px] text-ink-2 mb-2 px-0.5">{view.length}</div>
            <div className="grid grid-cols-4 gap-2">
              {view.map((e) => (
                <ShelfItem key={e.comicId} e={e} shelf={shelf} sort={sort} today={today} />
              ))}
            </div>
          </>
        )}
      </div>
    </Screen>
  );
}

function ShelfItem({ e, shelf, sort, today }: { e: Entry; shelf: Shelf; sort: ShelfSort; today: string }) {
  const soon = (e.meta.releaseDate ?? '') > today;
  const v = valueOf(e);
  const caption =
    shelf === 'owned' && sort === 'value' && v.amount != null ? (
      <span className="text-lb-green font-semibold">{fmtMoney(v.amount)}</span>
    ) : shelf === 'wishlist' && sort === 'release' && e.meta.releaseDate ? (
      fmtDate(e.meta.releaseDate)
    ) : undefined;
  return (
    <ComicTile
      comic={e.meta}
      stars={shelf === 'read' || e.rating != null ? e.rating : undefined}
      label={soon ? 'Soon' : e.variants.length > 1 ? `×${e.variants.length}` : undefined}
      labelTone={soon ? 'orange' : 'dark'}
      caption={caption}
    />
  );
}

function uniq<T>(xs: T[]): T[] {
  return [...new Set(xs)];
}
