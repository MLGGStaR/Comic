// "My series": everything you follow, plus any series you own or have read
// an issue of. Used to pin your pull list on Home and in the Calendar.
import { useMemo } from 'react';
import { useCollection } from './collection';
import { useFollows } from './follows';

export function useMySeries(): Set<string> {
  const { entries } = useCollection();
  const follows = useFollows();
  return useMemo(() => {
    const s = new Set<string>(follows.keys());
    for (const e of entries.values()) {
      if ((e.owned || e.read) && e.meta.seriesId && e.meta.format === 'issue') s.add(e.meta.seriesId);
    }
    return s;
  }, [entries, follows]);
}
