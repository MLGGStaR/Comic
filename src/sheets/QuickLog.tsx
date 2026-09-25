// Hold any cover → this sheet. Have it / Read / Wishlist toggle instantly
// (owning it asks which cover); the rating (drag the stars) saves a moment
// after you let go.
import { useEffect, useRef, useState } from 'react';
import type { ComicLite } from '../types';
import { Sheet } from '../ui/Sheet';
import { Cover } from '../ui/Cover';
import { StarPicker } from '../ui/Stars';
import { collection, useEntry } from '../state/collection';
import { StatusToggles } from '../ui/StatusToggles';
import { CoverPicker } from '../ui/CoverPicker';
import { isoDay } from '../lib/entry';
import { fmtDate } from '../lib/format';

export function QuickLogSheet({ comic, onClose }: { comic: ComicLite; onClose: () => void }) {
  const entry = useEntry(comic.id);
  const [rating, setRating] = useState(entry?.rating ?? 0);
  const pending = useRef<number | null>(null);
  const timer = useRef<number | null>(null);

  useEffect(() => {
    if (pending.current == null) setRating(entry?.rating ?? 0);
  }, [entry?.rating]);

  const flush = () => {
    if (timer.current) window.clearTimeout(timer.current);
    timer.current = null;
    const r = pending.current;
    pending.current = null;
    if (r != null && r !== (collection.entry(comic.id)?.rating ?? 0)) void collection.patch(comic, { rating: r });
  };
  useEffect(() => flush, []); // eslint-disable-line react-hooks/exhaustive-deps

  const onRate = (v: number) => {
    setRating(v);
    pending.current = v;
    if (timer.current) window.clearTimeout(timer.current);
    timer.current = window.setTimeout(flush, 650);
  };

  return (
    <Sheet onClose={onClose} label="Log comic">
      <div className="flex gap-3 items-center mb-4">
        <div className="w-14 aspect-[2/3] rounded-md overflow-hidden bg-bg-2 flex-shrink-0">
          <Cover src={comic.cover} alt={comic.title} className="w-full h-full" />
        </div>
        <div className="min-w-0">
          <div className="text-[15px] font-semibold leading-snug line-clamp-2">{comic.title}</div>
          <div className="text-xs text-ink-2 mt-0.5 truncate">
            {[comic.publisher, fmtDate(comic.releaseDate)].filter(Boolean).join(' · ')}
          </div>
        </div>
      </div>

      <StatusToggles comic={comic} />
      <CoverPicker comic={comic} className="mt-3" />

      <div className="mt-4 rounded-2xl bg-bg-0/40 py-2">
        <StarPicker value={rating} onChange={onRate} />
        <div className="flex items-center justify-center gap-2 pb-1 h-8">
          {entry?.read ? (
            <>
              <span className="text-xs text-ink-2">read on</span>
              <input
                type="date"
                value={entry.readAt ?? ''}
                max={isoDay(new Date())}
                onChange={(e) => e.target.value && void collection.patch(comic, { read: true, readAt: e.target.value })}
                className="bg-bg-2 rounded-lg px-2 py-1 text-sm text-ink-0"
              />
              {rating ? (
                <button
                  onClick={() => {
                    pending.current = null;
                    setRating(0);
                    void collection.patch(comic, { rating: null });
                  }}
                  className="text-xs text-ink-2 px-2 py-1"
                >
                  clear ★
                </button>
              ) : null}
            </>
          ) : (
            <span className="text-xs text-ink-2">rate it to mark it read</span>
          )}
        </div>
      </div>

      <button onClick={onClose} className="w-full mt-4 py-3 rounded-xl bg-bg-2 text-ink-0 font-semibold text-sm">
        Done
      </button>
    </Sheet>
  );
}
