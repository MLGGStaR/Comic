import type { ReactNode } from 'react';
import type { ComicLite } from '../types';
import { useActions } from '../state/actions';
import { useEntry } from '../state/collection';
import { Cover } from './Cover';
import { Stars } from './Stars';
import { usePress } from './press';
import { Icon } from './Icon';

// A cover you can tap (open) or hold (quick log). Optional: your status
// badge, stars below, a corner label ("NEW", "3d", "#4").
export function ComicTile({
  comic,
  width,
  stars,
  showStatus,
  label,
  labelTone = 'blue',
  caption,
  children,
}: {
  comic: ComicLite;
  width?: number;
  stars?: number | null;
  showStatus?: boolean;
  label?: string;
  labelTone?: 'blue' | 'green' | 'orange' | 'dark';
  caption?: ReactNode;
  children?: ReactNode;
}) {
  const a = useActions();
  const entry = useEntry(showStatus ? comic.id : null);
  const press = usePress(
    () => a.openComic(comic),
    () => a.quickLog(comic),
  );
  const tone =
    labelTone === 'green'
      ? 'bg-lb-green/90 text-bg-0'
      : labelTone === 'orange'
      ? 'bg-lb-orange/90 text-bg-0'
      : labelTone === 'dark'
      ? 'bg-black/70 text-ink-0'
      : 'bg-lb-blue/90 text-bg-0';
  return (
    <button
      {...press}
      aria-label={comic.title}
      className={`block text-left ${width ? 'flex-shrink-0 snap-start' : 'w-full'}`}
      style={width ? { width } : undefined}
    >
      <div className="cover relative aspect-[2/3] rounded-lg overflow-hidden bg-bg-2 shadow-[0_2px_8px_rgba(0,0,0,0.3)]">
        <Cover src={comic.cover} alt={comic.title} className="w-full h-full" />
        {label ? (
          <span className={`absolute top-1 left-1 rounded px-1 py-[1px] text-[9px] font-extrabold uppercase tracking-wide ${tone}`}>
            {label}
          </span>
        ) : null}
        {entry ? <StatusBadge owned={entry.owned} read={entry.read} wishlist={entry.wishlist} /> : null}
        {children}
      </div>
      {stars != null ? <Stars value={stars} className="text-center mt-0.5 text-[12px]" /> : null}
      {caption ? <div className="text-[10px] text-ink-1 mt-1 truncate">{caption}</div> : null}
    </button>
  );
}

export function StatusBadge({ owned, read, wishlist }: { owned: boolean; read: boolean; wishlist: boolean }) {
  if (!owned && !read && !wishlist) return null;
  const cls = owned
    ? 'bg-lb-green text-bg-0'
    : read
    ? 'bg-lb-blue text-bg-0'
    : 'bg-lb-orange text-bg-0';
  return (
    <span className={`absolute top-1 right-1 w-5 h-5 rounded-full flex items-center justify-center shadow ${cls}`}>
      <Icon name={owned ? 'check' : read ? 'book' : 'bookmark'} size={11} strokeWidth={3} />
    </span>
  );
}
