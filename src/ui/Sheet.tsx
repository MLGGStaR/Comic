import { useRef, type ReactNode } from 'react';
import { useBackLayer } from '../lib/backstack';

// Bottom sheet: dimmed backdrop, grab handle, drag down to dismiss (only
// while the sheet's own content is scrolled to the top), back-button aware.
export function Sheet({
  onClose,
  children,
  className,
  label,
}: {
  onClose: () => void;
  children: ReactNode;
  className?: string;
  label?: string;
}) {
  useBackLayer(onClose);
  const panelRef = useRef<HTMLDivElement | null>(null);
  const drag = useRef<{ y: number; t: number; dy: number; on: boolean } | null>(null);

  const onTouchStart = (e: React.TouchEvent) => {
    const panel = panelRef.current;
    if (!panel || panel.scrollTop > 0) return;
    if ((e.target as Element).closest('input, textarea, select, [data-nodrag]')) return;
    drag.current = { y: e.touches[0].clientY, t: Date.now(), dy: 0, on: false };
  };
  const onTouchMove = (e: React.TouchEvent) => {
    const d = drag.current;
    const panel = panelRef.current;
    if (!d || !panel) return;
    d.dy = e.touches[0].clientY - d.y;
    if (!d.on) {
      if (d.dy < 8) {
        if (d.dy < -4) drag.current = null;
        return;
      }
      d.on = true;
    }
    panel.style.transition = 'none';
    panel.style.transform = `translateY(${Math.max(0, d.dy)}px)`;
  };
  const onTouchEnd = () => {
    const d = drag.current;
    const panel = panelRef.current;
    drag.current = null;
    if (!d?.on || !panel) return;
    const v = d.dy / Math.max(1, Date.now() - d.t);
    if (d.dy > 130 || (v > 0.6 && d.dy > 40)) {
      panel.style.transition = 'transform 180ms ease-in';
      panel.style.transform = 'translateY(100%)';
      window.setTimeout(onClose, 170);
    } else {
      panel.style.transition = 'transform 220ms cubic-bezier(0.2, 0.9, 0.3, 1.1)';
      panel.style.transform = '';
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center" onClick={onClose} role="dialog" aria-label={label}>
      <div className="absolute inset-0 bg-bg-0/80 backdrop-blur-sm fade-in" />
      <div
        ref={panelRef}
        className={`relative bg-bg-1 border border-white/10 rounded-t-3xl sm:rounded-3xl w-full sm:max-w-md max-h-[88vh] overflow-y-auto overscroll-contain p-5 sheet-up ${
          className ?? ''
        }`}
        style={{ paddingBottom: 'max(1.5rem, env(safe-area-inset-bottom))' }}
        onClick={(e) => e.stopPropagation()}
        onTouchStart={onTouchStart}
        onTouchMove={onTouchMove}
        onTouchEnd={onTouchEnd}
        onTouchCancel={onTouchEnd}
      >
        <div className="mx-auto -mt-1 mb-4 h-1 w-9 rounded-full bg-white/20" />
        {children}
      </div>
    </div>
  );
}
