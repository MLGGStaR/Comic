// Entries for any user: yours come from the live store; a friend's are
// fetched (read-only) with an IndexedDB copy for instant display.
import { useEffect, useState } from 'react';
import { fetchEntries, useCollection } from './collection';
import { idbGet, idbSet } from '../lib/idb';
import type { Entry } from '../types';

export function useUserEntries(userId: string): { entries: Entry[]; loading: boolean } {
  const store = useCollection();
  const isSelf = store.userId === userId;
  const [other, setOther] = useState<Entry[] | null>(null);
  const [loading, setLoading] = useState(!isSelf);

  useEffect(() => {
    if (isSelf) return;
    let alive = true;
    (async () => {
      const cached = await idbGet<Entry[]>(`friend:${userId}`);
      if (alive && cached) setOther(cached);
      try {
        const fresh = await fetchEntries(userId);
        if (!alive) return;
        setOther(fresh);
        void idbSet(`friend:${userId}`, fresh);
      } catch {
        // offline: cached copy stays
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, [userId, isSelf]);

  if (isSelf) return { entries: [...store.entries.values()], loading: !store.loaded };
  return { entries: other ?? [], loading };
}
