// App-wide actions any view can trigger: open a comic/series/profile, the
// quick-log sheet (hold), the + menu and the scanners.
import { createContext, useContext } from 'react';
import type { ComicLite } from '../types';
import type { Shelf } from './nav';

export interface Actions {
  selfId: string | null;
  openComic: (c: ComicLite) => void;
  openComicId: (id: string) => void;
  openSeries: (id: string, title?: string) => void;
  openShelf: (shelf: Shelf, userId: string) => void;
  openPortfolio: (userId: string) => void;
  openUser: (userId: string) => void;
  openStats: (userId: string) => void;
  quickLog: (c: ComicLite) => void;
  openAdd: () => void;
  openScanner: (mode: 'barcode' | 'cover') => void;
  requireLogin: () => boolean; // true when signed in; otherwise explains + returns false
}

export const ActionsCtx = createContext<Actions | null>(null);

export function useActions(): Actions {
  const v = useContext(ActionsCtx);
  if (!v) throw new Error('useActions outside provider');
  return v;
}
