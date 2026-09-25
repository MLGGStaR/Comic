// A series: follow it (pull list), see how much of the run you own/read,
// spot the gaps (Missing), and browse its collected editions.
import { useEffect, useMemo, useState } from 'react';
import { api } from '../api/client';
import type { SeriesDetail } from '../types';
import { Screen } from '../ui/Screen';
import { Cover } from '../ui/Cover';
import { ComicTile } from '../ui/ComicTile';
import { Row, SectionHeader, Segmented, Empty } from '../ui/layout';
import { Icon } from '../ui/Icon';
import { useCollection } from '../state/collection';
import { toggleFollow, useFollows } from '../state/follows';
import { useActions } from '../state/actions';
import { compareComics } from '../lib/shelf';
import { toIso } from '../lib/dates';

type Filter = 'all' | 'missing' | 'owned' | 'unread';

export function SeriesScreen({ id, title, onClose }: { id: string; title?: string; onClose: () => void }) {
  const [s, setS] = useState<SeriesDetail | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [filter, setFilter] = useState<Filter>('all');
  const { entries } = useCollection();
  const follows = useFollows();
  const a = useActions();
  const today = toIso(new Date());

  useEffect(() => {
    let alive = true;
    api.swr<SeriesDetail>('series', { id }, 6 * 3600e3, (d) => alive && setS(d)).catch((e: Error) => alive && setErr(e.message));
    return () => {
      alive = false;
    };
  }, [id]);

  const issues = useMemo(() => [...(s?.issues ?? [])].sort(compareComics), [s]);
  const released = issues.filter((c) => !c.releaseDate || c.releaseDate <= today);
  const owned = released.filter((c) => entries.get(c.id)?.owned).length;
  const read = released.filter((c) => entries.get(c.id)?.read).length;
  const shown = issues.filter((c) => {
    const e = entries.get(c.id);
    if (filter === 'missing') return !e?.owned && (!c.releaseDate || c.releaseDate <= today);
    if (filter === 'owned') return !!e?.owned;
    if (filter === 'unread') return !e?.read && (!c.releaseDate || c.releaseDate <= today);
    return true;
  });
  const following = follows.has(id);

  return (
    <Screen onClose={onClose} title={s?.title ?? title}>
      <div className="px-3 pb-24 space-y-6">
        {!s && err ? <Empty title="Couldn't load this series">{err}</Empty> : null}
        {!s && !err ? (
          <div className="flex gap-4 px-1">
            <div className="w-24 aspect-[2/3] rounded-lg skeleton" />
            <div className="flex-1 space-y-2 py-2">
              <div className="h-6 w-3/4 rounded skeleton" />
              <div className="h-3 w-1/2 rounded skeleton" />
            </div>
          </div>
        ) : null}
        {s ? (
          <>
            <div className="flex gap-4 px-1">
              <div className="w-24 aspect-[2/3] rounded-lg overflow-hidden bg-bg-2 flex-shrink-0 shadow-[0_10px_28px_rgba(0,0,0,0.5)]">
                <Cover src={s.cover ?? issues[0]?.cover} alt={s.title} className="w-full h-full" eager />
              </div>
              <div className="min-w-0 flex-1 py-0.5">
                <div className="font-display text-[22px] font-extrabold leading-tight">{s.title}</div>
                <div className="text-xs text-ink-2 mt-1">{[s.publisher, s.years].filter(Boolean).join(' · ')}</div>
                <div className="text-xs text-ink-1 mt-1">
                  {issues.length} issue{issues.length === 1 ? '' : 's'}
                  {s.collections.length ? ` · ${s.collections.length} collected` : ''}
                </div>
                <button
                  onClick={() => a.requireLogin() && void toggleFollow({ seriesId: id, title: s.title, publisher: s.publisher, cover: s.cover ?? issues[0]?.cover ?? null })}
                  className={`mt-3 px-4 py-2 rounded-xl text-[13px] font-bold inline-flex items-center gap-1.5 ${
                    following ? 'bg-bg-2 text-lb-green' : 'btn-primary !py-2'
                  }`}
                >
                  <Icon name={following ? 'check' : 'plus'} size={16} strokeWidth={2.8} />
                  {following ? 'Following' : 'Follow'}
                </button>
              </div>
            </div>

            {a.selfId && released.length ? (
              <div className="rounded-2xl bg-bg-1 border border-white/[0.05] p-4">
                <div className="flex justify-between text-xs mb-2">
                  <span className="text-ink-1">
                    You own <b className="text-lb-green">{owned}</b> of {released.length}
                  </span>
                  <span className="text-ink-1">
                    read <b className="text-lb-blue">{read}</b>
                  </span>
                </div>
                <div className="h-2 rounded-full bg-bg-2 overflow-hidden relative">
                  <div className="absolute inset-y-0 left-0 rounded-full bg-lb-blue/50" style={{ width: `${(read / released.length) * 100}%` }} />
                  <div className="absolute inset-y-0 left-0 rounded-full bg-lb-green" style={{ width: `${(owned / released.length) * 100}%` }} />
                </div>
              </div>
            ) : null}

            {s.description ? <p className="text-[13px] text-ink-1 leading-relaxed px-1 line-clamp-4">{s.description}</p> : null}

            {s.collections.length ? (
              <section>
                <SectionHeader>Collected editions</SectionHeader>
                <Row>
                  {s.collections.map((c) => (
                    <ComicTile key={c.id} comic={c} width={96} showStatus caption={c.title.replace(s.title, '').replace(/^[\s:–-]+/, '') || c.title} />
                  ))}
                </Row>
              </section>
            ) : null}

            <section>
              <SectionHeader>Issues</SectionHeader>
              {a.selfId ? (
                <Segmented
                  value={filter}
                  onChange={setFilter}
                  options={[
                    ['all', 'All'],
                    ['missing', 'Missing'],
                    ['owned', 'Owned'],
                    ['unread', 'Unread'],
                  ]}
                  className="mb-3"
                />
              ) : null}
              {shown.length ? (
                <div className="grid grid-cols-4 gap-2">
                  {shown.map((c) => (
                    <ComicTile
                      key={c.id}
                      comic={c}
                      showStatus
                      caption={c.number ? `#${c.number}` : c.title}
                      label={c.releaseDate && c.releaseDate > today ? 'Soon' : undefined}
                      labelTone="blue"
                    />
                  ))}
                </div>
              ) : (
                <Empty title={filter === 'missing' ? 'Complete run — nothing missing' : 'Nothing here'} />
              )}
            </section>
          </>
        ) : null}
      </div>
    </Screen>
  );
}
