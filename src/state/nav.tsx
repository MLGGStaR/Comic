// Pushed-screen navigation: a stack of routes rendered as full-screen layers
// above the tab bar. Each layer registers with the back stack itself.
import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';
import type { ComicLite } from '../types';

export type Shelf = 'owned' | 'read' | 'wishlist';

export type Route =
  | { t: 'comic'; id: string; seed?: ComicLite }
  | { t: 'series'; id: string; title?: string }
  | { t: 'shelf'; shelf: Shelf; userId: string }
  | { t: 'portfolio'; userId: string }
  | { t: 'profile'; userId: string }
  | { t: 'friends' }
  | { t: 'stats'; userId: string };

interface Nav {
  stack: Route[];
  push: (r: Route) => void;
  /** remove the layer at `index` (and anything above it) */
  closeAt: (index: number) => void;
}

const Ctx = createContext<Nav | null>(null);

export function NavProvider({ children }: { children: ReactNode }) {
  const [stack, setStack] = useState<Route[]>([]);
  const push = useCallback((r: Route) => setStack((s) => [...s, r]), []);
  const closeAt = useCallback((index: number) => setStack((s) => s.slice(0, index)), []);
  const value = useMemo(() => ({ stack, push, closeAt }), [stack, push, closeAt]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useNav(): Nav {
  const v = useContext(Ctx);
  if (!v) throw new Error('useNav outside NavProvider');
  return v;
}
