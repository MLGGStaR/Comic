// Letterboxd-style rating histogram (from letterSizd). Tap a bar to filter;
// press-and-drag across the bars to inspect counts.
import { useRef, useState } from 'react';

const TIERS = [0.5, 1, 1.5, 2, 2.5, 3, 3.5, 4, 4.5, 5];
const BAR = 'linear-gradient(180deg, #19d94a, #00b52e)';
const BAR_HOT = 'linear-gradient(180deg, #ffb340, #ff8000)';

export function RatingHistogram({
  countFor,
  active,
  onSelect,
}: {
  countFor: (tier: number) => number;
  active: number | 'any';
  onSelect: (tier: number | 'any') => void;
}) {
  const counts = TIERS.map((t) => countFor(t));
  const max = Math.max(1, ...counts);
  const total = counts.reduce((a, b) => a + b, 0);
  const [inspect, setInspect] = useState<number | null>(null);
  const barRef = useRef<HTMLDivElement>(null);
  const movedRef = useRef(false);

  if (total === 0) return null;

  const idxFromX = (clientX: number): number | null => {
    const el = barRef.current;
    if (!el) return null;
    const r = el.getBoundingClientRect();
    const i = Math.floor(((clientX - r.left) / r.width) * TIERS.length);
    return i >= 0 && i < TIERS.length ? i : null;
  };

  return (
    <div className="mb-3 select-none" data-nopull>
      <div
        ref={barRef}
        className="flex items-end gap-[3px] h-14 relative"
        style={{ touchAction: 'none' }}
        onPointerDown={(e) => {
          movedRef.current = false;
          (e.currentTarget as HTMLDivElement).setPointerCapture?.(e.pointerId);
          setInspect(idxFromX(e.clientX));
        }}
        onPointerMove={(e) => {
          if (e.buttons || e.pointerType === 'touch') {
            const i = idxFromX(e.clientX);
            if (i != null && i !== inspect) {
              movedRef.current = true;
              setInspect(i);
            }
          }
        }}
        onPointerUp={(e) => {
          const i = idxFromX(e.clientX);
          (e.currentTarget as HTMLDivElement).releasePointerCapture?.(e.pointerId);
          setInspect(null);
          if (!movedRef.current && i != null) onSelect(active === TIERS[i] ? 'any' : TIERS[i]);
        }}
        onPointerCancel={() => setInspect(null)}
      >
        {TIERS.map((t, i) => {
          const c = counts[i];
          const on = active === t;
          const hot = inspect === i;
          const h = c === 0 ? 2 : Math.max(4, Math.round((c / max) * 100));
          return (
            <div key={t} className="flex-1 relative flex flex-col justify-end h-full">
              {hot ? (
                <div className="absolute -top-9 left-1/2 -translate-x-1/2 bg-bg-2 border border-white/10 rounded-lg px-2 py-1 shadow-xl whitespace-nowrap z-10 text-center">
                  <div className="text-[11px] font-bold text-ink-0 leading-tight">{c}</div>
                  <div className="text-[9px] font-semibold leading-tight text-lb-orange">{t}★</div>
                </div>
              ) : null}
              <div
                className="w-full rounded-t-[3px] transition-all"
                style={{
                  height: `${h}%`,
                  background: c === 0 ? 'rgba(174, 185, 202, 0.15)' : on || hot ? BAR_HOT : BAR,
                  opacity: c === 0 ? 1 : on || hot ? 1 : active !== 'any' || inspect != null ? 0.35 : 0.9,
                  boxShadow: on || hot ? '0 0 14px rgba(255, 128, 0, 0.45)' : undefined,
                }}
              />
            </div>
          );
        })}
      </div>
      <div className="flex justify-between items-center mt-1 px-0.5">
        <span className="text-[10px] text-ink-2">½★</span>
        {active !== 'any' ? (
          <button onClick={() => onSelect('any')} className="text-[10px] text-lb-orange font-semibold">
            {active}★ only · clear
          </button>
        ) : (
          <span className="text-[10px] text-ink-2">{total} rated</span>
        )}
        <span className="text-[10px] text-ink-2">5★</span>
      </div>
    </div>
  );
}
