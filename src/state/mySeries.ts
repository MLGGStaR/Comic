// "My series": everything you follow, plus any series you own or have read
// an issue of. Weekly release lists carry no series id, so matching also
// works by normalised series name ("Absolute Batman" ≈ "absolute batman").
import { useCallback, useMemo } from 'react';
import { useCollection } from './collection';
import { useFollows } from './follows';
import type { ComicLite } from '../types';

export function seriesKey(name: string | null | undefined): string {
  return (name ?? '')
    .toLowerCase()
    .replace(/^the\s+/, '')
    .replace(/\b(annual|special|one-shot)\b/g, '')
    .replace(/\b(19|20)\d{2}\b/g, '')
    .replace(/[^a-z0-9]+/g, '');
}

const seriesOf = (c: ComicLite) => c.series ?? c.title.replace(/\s+#.*$/, '');

export function useMySeries(): (c: ComicLite) => boolean {
  const { entries } = useCollection();
  const follows = useFollows();
  const sets = useMemo(() => {
    const ids = new Set<string>();
    const names = new Set<string>();
    for (const f of follows.values()) {
      ids.add(f.seriesId);
      names.add(seriesKey(f.title));
    }
    for (const e of entries.values()) {
      if (!(e.owned || e.read) || e.meta.format !== 'issue') continue;
      if (e.meta.seriesId) ids.add(e.meta.seriesId);
      const k = seriesKey(seriesOf(e.meta));
      if (k) names.add(k);
    }
    return { ids, names };
  }, [entries, follows]);
  return useCallback(
    (c: ComicLite) => (c.seriesId != null && sets.ids.has(c.seriesId)) || (c.format === 'issue' && sets.names.has(seriesKey(seriesOf(c)))),
    [sets],
  );
}
