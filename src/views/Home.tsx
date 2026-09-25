// Home: your numbers, friends' latest, your pull list, what's new and
// what's next — tinted by the cover of the last thing you read.
import { useEffect, useMemo, useState } from 'react';
import { api } from '../api/client';
import { useActions } from '../state/actions';
import { useCollection } from '../state/collection';
import { useMySeries } from '../state/mySeries';
import { useFriendsFeed, type FeedItem } from '../state/friendsFeed';
import { useOnRefresh } from '../state/refresh';
import { profileById, useProfiles } from '../state/profiles';
import type { ComicLite, Entry } from '../types';
import { portfolio, compareComics } from '../lib/shelf';
import { weekStart, addDays, toIso } from '../lib/dates';
import { daysUntil, fmtMoney } from '../lib/format';
import { Row, SectionHeader, Stat } from '../ui/layout';
import { ComicTile } from '../ui/ComicTile';
import { FriendDot } from '../ui/FriendDot';
import { Stars } from '../ui/Stars';
import { useCoverTint } from '../ui/tint';
import { Icon } from '../ui/Icon';

const TILE = 104;

export function HomeView() {
  const a = useActions();
  useProfiles();
  const { entries } = useCollection();
  const mine = useMySeries();
  const feed = useFriendsFeed(a.selfId);
  const today = toIso(new Date());
  const thisWeek = weekStart(new Date());

  // this week, last week and the next four weeks of releases
  const [weeks, setWeeks] = useState<Record<string, ComicLite[]>>({});
  const [nonce, setNonce] = useState(0);
  useOnRefresh(() => setNonce((n) => n + 1));
  useEffect(() => {
    let alive = true;
    const keys = [-7, 0, 7, 14, 21, 28].map((n) => addDays(thisWeek, n));
    for (const k of keys) {
      api
        .week(k)
        .then((list) => alive && setWeeks((w) => ({ ...w, [k]: list })))
        .catch(() => {});
    }
    return () => {
      alive = false;
    };
  }, [thisWeek, nonce]);

  const list = useMemo(() => [...entries.values()], [entries]);
  const year = String(new Date().getFullYear());
  const stats = useMemo(() => {
    const p = portfolio(list);
    return {
      owned: p.owned,
      read: list.filter((e) => e.read).length,
      year: list.filter((e) => e.read && (e.readAt ?? '').startsWith(year)).length,
      value: p.total,
    };
  }, [list, year]);

  const recentReads = useMemo(
    () => list.filter((e) => e.read).sort((x, y) => (y.readAt ?? '').localeCompare(x.readAt ?? '') || y.updatedAt.localeCompare(x.updatedAt)),
    [list],
  );
  const tint = useCoverTint(recentReads[0]?.meta.cover ?? list[0]?.meta.cover);

  const current = weeks[thisWeek] ?? [];
  const isMine = (c: ComicLite) => c.seriesId != null && mine.has(c.seriesId);
  const pull = useMemo(() => current.filter(isMine).sort((x, y) => (y.pulls ?? 0) - (x.pulls ?? 0)), [current, mine]); // eslint-disable-line react-hooks/exhaustive-deps
  const hot = useMemo(
    () => current.filter((c) => c.format === 'issue' && !isMine(c)).sort((x, y) => (y.pulls ?? 0) - (x.pulls ?? 0)).slice(0, 20),
    [current, mine], // eslint-disable-line react-hooks/exhaustive-deps
  );
  const comingUp = useMemo(() => {
    const out: ComicLite[] = [];
    for (const [k, v] of Object.entries(weeks)) {
      if (k <= thisWeek) continue;
      for (const c of v) if (isMine(c) && (c.releaseDate ?? k) > today) out.push(c);
    }
    return out.sort((x, y) => (x.releaseDate ?? '').localeCompare(y.releaseDate ?? '')).slice(0, 20);
  }, [weeks, mine, thisWeek, today]); // eslint-disable-line react-hooks/exhaustive-deps

  // "To read": owned but unread, the next unread issue per series first
  const toRead = useMemo(() => {
    const unread = list.filter((e) => e.owned && !e.read).sort((x, y) => compareComics(x.meta, y.meta));
    const seen = new Set<string>();
    const firstPerSeries: Entry[] = [];
    const rest: Entry[] = [];
    for (const e of unread) {
      const k = e.meta.seriesId ?? e.comicId;
      if (seen.has(k)) rest.push(e);
      else {
        seen.add(k);
        firstPerSeries.push(e);
      }
    }
    return [...firstPerSeries, ...rest].slice(0, 20);
  }, [list]);

  const wishOut = useMemo(
    () => list.filter((e) => e.wishlist && e.meta.releaseDate && e.meta.releaseDate <= today).sort((x, y) => (y.meta.releaseDate ?? '').localeCompare(x.meta.releaseDate ?? '')).slice(0, 20),
    [list, today],
  );

  const friendItems = useMemo(() => feed.filter((f) => f.read || f.owned).slice(0, 30), [feed]);
  const popular = useMemo(() => popularWithFriends(feed), [feed]);

  return (
    <div className="space-y-7 relative isolate">
      {tint ? (
        <div
          aria-hidden
          className="pointer-events-none absolute -top-24 -inset-x-3 h-80 -z-10 transition-opacity duration-700"
          style={{ background: `radial-gradient(ellipse 80% 60% at 50% 0%, ${tint} 0%, transparent 72%)` }}
        />
      ) : null}

      {a.selfId ? (
        <div className="flex justify-between items-end px-1 pt-1">
          <Stat value={stats.owned} label="owned" />
          <Stat value={stats.read} label="read" />
          <Stat value={stats.year} label="this year" accent />
          <Stat value={fmtMoney(stats.value, { compact: true })} label="value" />
        </div>
      ) : (
        <div className="card !p-4 text-sm text-ink-1">
          <b className="text-ink-0">Welcome to Longbox.</b> Log in from the gear to track your comics and see your friends'.
        </div>
      )}

      {friendItems.length ? (
        <section>
          <SectionHeader>Friends</SectionHeader>
          <Row>
            {friendItems.map((f) => (
              <FriendTile key={`${f.userId}:${f.comicId}`} f={f} />
            ))}
          </Row>
        </section>
      ) : null}

      {pull.length ? (
        <section>
          <SectionHeader>Your pull list</SectionHeader>
          <Row>
            {pull.map((c) => (
              <ComicTile key={c.id} comic={c} width={TILE} showStatus label="New" labelTone="green" />
            ))}
          </Row>
        </section>
      ) : null}

      {hot.length ? (
        <section>
          <SectionHeader>New this week</SectionHeader>
          <Row>
            {hot.map((c) => (
              <ComicTile key={c.id} comic={c} width={TILE} showStatus />
            ))}
          </Row>
        </section>
      ) : null}

      {toRead.length ? (
        <section>
          <SectionHeader>To read</SectionHeader>
          <Row>
            {toRead.map((e) => (
              <ComicTile key={e.comicId} comic={e.meta} width={TILE} caption={e.meta.title} />
            ))}
          </Row>
        </section>
      ) : null}

      {comingUp.length ? (
        <section>
          <SectionHeader>Coming up</SectionHeader>
          <Row>
            {comingUp.map((c) => (
              <ComicTile key={c.id} comic={c} width={TILE} showStatus label={daysUntil(c.releaseDate ?? '')} labelTone="blue" />
            ))}
          </Row>
        </section>
      ) : null}

      {popular.length ? (
        <section>
          <SectionHeader>Popular with friends</SectionHeader>
          <Row>
            {popular.map((p) => (
              <ComicTile key={p.comic.id} comic={p.comic} width={TILE} showStatus caption={`${p.count} friends`} />
            ))}
          </Row>
        </section>
      ) : null}

      {recentReads.length ? (
        <section>
          <SectionHeader>Recent</SectionHeader>
          <Row>
            {recentReads.slice(0, 15).map((e) => (
              <ComicTile key={e.comicId} comic={e.meta} width={TILE} stars={e.rating} />
            ))}
          </Row>
        </section>
      ) : null}

      {wishOut.length ? (
        <section>
          <SectionHeader>Wishlist · out now</SectionHeader>
          <Row>
            {wishOut.map((e) => (
              <ComicTile key={e.comicId} comic={e.meta} width={TILE} />
            ))}
          </Row>
        </section>
      ) : null}

      {a.selfId && !list.length ? (
        <button onClick={a.openAdd} className="w-full card !p-4 flex items-center gap-3 text-left press">
          <span className="w-11 h-11 rounded-xl bg-lb-green/15 text-lb-green flex items-center justify-center">
            <Icon name="camera" size={22} />
          </span>
          <span className="flex-1">
            <span className="block text-sm font-semibold">Add your first comic</span>
            <span className="block text-xs text-ink-2">Scan a cover or barcode — or search it.</span>
          </span>
          <Icon name="chevron-right" size={18} className="text-ink-2" />
        </button>
      ) : null}
    </div>
  );
}

function FriendTile({ f }: { f: FeedItem }) {
  const a = useActions();
  const p = profileById(f.userId);
  if (!p) return null;
  return (
    <div className="flex-shrink-0 snap-start" style={{ width: TILE }}>
      <ComicTile comic={f.meta} showStatus />
      <button onClick={() => a.openUser(f.userId)} className="flex items-center gap-1 mt-1 max-w-full">
        <FriendDot profile={p} />
        <span className="text-[10px] text-ink-1 truncate">{p.username}</span>
      </button>
      {f.rating != null ? <Stars value={f.rating} className="text-[11px]" /> : !f.read && f.owned ? <div className="text-[10px] text-ink-2">picked up</div> : null}
    </div>
  );
}

function popularWithFriends(feed: FeedItem[]) {
  const cutoff = new Date(Date.now() - 30 * 86400e3).toISOString();
  const m = new Map<string, { comic: ComicLite; users: Set<string> }>();
  for (const f of feed) {
    if (f.updatedAt < cutoff || !(f.read || f.owned)) continue;
    const row = m.get(f.comicId) ?? { comic: f.meta, users: new Set<string>() };
    row.users.add(f.userId);
    m.set(f.comicId, row);
  }
  return [...m.values()]
    .filter((r) => r.users.size >= 2)
    .sort((x, y) => y.users.size - x.users.size)
    .slice(0, 15)
    .map((r) => ({ comic: r.comic, count: r.users.size }));
}
