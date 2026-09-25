// Pull-to-refresh / refresh button broadcast: views subscribe and refetch.
import { useEffect, useRef } from 'react';

const listeners = new Set<() => Promise<unknown> | void>();

export async function refreshAll(): Promise<void> {
  await Promise.allSettled([...listeners].map((l) => l()));
}

export function useOnRefresh(fn: () => Promise<unknown> | void) {
  const ref = useRef(fn);
  ref.current = fn;
  useEffect(() => {
    const l = () => ref.current();
    listeners.add(l);
    return () => {
      listeners.delete(l);
    };
  }, []);
}
