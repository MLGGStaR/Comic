// A friend's longbox: their numbers, shelves, latest reads and top-rated.
import { useMemo } from 'react';
import { Screen } from '../ui/Screen';
import { useUserEntries } from '../state/userEntries';
import { profileById, useProfiles } from '../state/profiles';
import { useActions } from '../state/actions';
import { portfolio } from '../lib/shelf';
import { fmtMoney } from '../lib/format';
import { FriendDot } from '../ui/FriendDot';
import { Row, SectionHeader, Stat, Empty } from '../ui/layout';
import { ComicTile } from '../ui/ComicTile';
import { Icon } from '../ui/Icon';

export function ProfileScreen({ userId, onClose }: { userId: string; onClose: () => void }) {
  useProfiles();
  const a = useActions();
  const prof = profileById(userId);
  const { entries, loading } = useUserEntries(userId);
  const year = String(new Date().getFullYear());

  const d = useMemo(() => {
    const read = entries.filter((e) => e.read).sort((x, y) => (y.readAt ?? '').localeCompare(x.readAt ?? ''));
    return {
      owned: entries.filter((e) => e.owned).length,
      wishlist: entries.filter((e) => e.wishlist).length,
      read,
      readYear: read.filter((e) => (e.readAt ?? '').startsWith(year)).length,
      top: [...read].filter((e) => e.rating != null).sort((x, y) => (y.rating ?? 0) - (x.rating ?? 0)).slice(0, 15),
      recentOwned: entries.filter((e) => e.owned).sort((x, y) => y.addedAt.localeCompare(x.addedAt)).slice(0, 15),
      value: portfolio(entries).total,
    };
  }, [entries, year]);

  return (
    <Screen onClose={onClose} title={prof?.username ?? 'Profile'}>
      <div className="px-3 pb-24 space-y-7">
        <div className="flex items-center gap-3 px-1">
          {prof ? <FriendDot profile={prof} size={56} /> : null}
          <div className="min-w-0">
            <div className="font-display text-2xl font-extrabold truncate">{prof?.username ?? '…'}</div>
            <div className="text-xs text-ink-2">{loading && !entries.length ? 'Loading…' : `${entries.length} comics tracked`}</div>
          </div>
        </div>

        <div className="flex justify-between items-end px-1">
          <Stat value={d.owned} label="owned" />
          <Stat value={d.read.length} label="read" />
          <Stat value={d.readYear} label="this year" accent />
          <Stat value={fmtMoney(d.value, { compact: true })} label="value" />
        </div>

        <div className="grid grid-cols-3 gap-2">
          {(
            [
              ['owned', 'Comics', d.owned],
              ['read', 'Read', d.read.length],
              ['wishlist', 'Wishlist', d.wishlist],
            ] as const
          ).map(([shelf, label, n]) => (
            <button key={shelf} onClick={() => a.openShelf(shelf, userId)} className="card !p-3 text-left press">
              <div className="font-display text-xl font-extrabold leading-none">{n}</div>
              <div className="text-[11px] text-ink-2 mt-1 flex items-center gap-0.5">
                {label} <Icon name="chevron-right" size={12} />
              </div>
            </button>
          ))}
        </div>

        {d.read.length ? (
          <section>
            <SectionHeader>Latest reads</SectionHeader>
            <Row>
              {d.read.slice(0, 15).map((e) => (
                <ComicTile key={e.comicId} comic={e.meta} width={96} stars={e.rating} showStatus />
              ))}
            </Row>
          </section>
        ) : null}

        {d.top.length ? (
          <section>
            <SectionHeader>Top rated</SectionHeader>
            <Row>
              {d.top.map((e) => (
                <ComicTile key={e.comicId} comic={e.meta} width={96} stars={e.rating} showStatus />
              ))}
            </Row>
          </section>
        ) : null}

        {d.recentOwned.length ? (
          <section>
            <SectionHeader>New in their longbox</SectionHeader>
            <Row>
              {d.recentOwned.map((e) => (
                <ComicTile key={e.comicId} comic={e.meta} width={96} showStatus />
              ))}
            </Row>
          </section>
        ) : null}

        {!loading && !entries.length ? <Empty title="Nothing here yet">They haven't logged any comics.</Empty> : null}
      </div>
    </Screen>
  );
}
