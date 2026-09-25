import { useEffect, useRef, type ReactNode } from 'react';
import { useBackLayer } from '../lib/backstack';
import { Icon } from './Icon';

// A pushed page (comic, series, shelf…): slides in from the right, closes
// with the back chevron, Android back, or an iOS-style swipe from the left
// edge that follows the finger. The top bar can start transparent over a
// hero image and turns solid once you scroll.
export function Screen({
  onClose,
  title,
  right,
  transparentTop,
  children,
}: {
  onClose: () => void;
  title?: ReactNode;
  right?: ReactNode;
  transparentTop?: boolean;
  children: ReactNode;
}) {
  useBackLayer(onClose);
  const rootRef = useRef<HTMLDivElement | null>(null);
  const barRef = useRef<HTMLDivElement | null>(null);
  const titleRef = useRef<HTMLDivElement | null>(null);

  // solid bar after scrolling (direct DOM writes — no re-render per frame)
  useEffect(() => {
    const root = rootRef.current;
    if (!root || !transparentTop) return;
    const onScroll = () => {
      const solid = root.scrollTop > 160;
      if (barRef.current) barRef.current.dataset.solid = solid ? '1' : '0';
      if (titleRef.current) titleRef.current.style.opacity = solid ? '1' : '0';
    };
    onScroll();
    root.addEventListener('scroll', onScroll, { passive: true });
    return () => root.removeEventListener('scroll', onScroll);
  }, [transparentTop]);

  // edge swipe back
  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    let sx = 0;
    let sy = 0;
    let st = 0;
    let tracking = false;
    let engaged = false;
    const onStart = (e: TouchEvent) => {
      const t = e.touches[0];
      if (t.clientX > 28) return;
      sx = t.clientX;
      sy = t.clientY;
      st = Date.now();
      tracking = true;
      engaged = false;
    };
    const onMove = (e: TouchEvent) => {
      if (!tracking) return;
      const t = e.touches[0];
      const dx = t.clientX - sx;
      const dy = Math.abs(t.clientY - sy);
      if (!engaged) {
        if (dy > 20 && dy > dx) {
          tracking = false;
          return;
        }
        if (dx > 10 && dx > dy) engaged = true;
        else return;
      }
      if (e.cancelable) e.preventDefault();
      root.style.transition = 'none';
      root.style.transform = `translateX(${Math.max(0, dx)}px)`;
      root.style.boxShadow = '-12px 0 30px rgba(0,0,0,0.45)';
    };
    const onEnd = (e: TouchEvent) => {
      if (!tracking) return;
      tracking = false;
      if (!engaged) return;
      const dx = Math.max(0, e.changedTouches[0].clientX - sx);
      const v = dx / Math.max(1, Date.now() - st);
      if (dx > window.innerWidth * 0.33 || (v > 0.5 && dx > 50)) {
        root.style.transition = 'transform 170ms ease-out';
        root.style.transform = 'translateX(100%)';
        window.setTimeout(onClose, 160);
      } else {
        root.style.transition = 'transform 220ms cubic-bezier(0.2, 0.9, 0.3, 1.1)';
        root.style.transform = '';
        root.style.boxShadow = '';
      }
    };
    root.addEventListener('touchstart', onStart, { passive: true });
    root.addEventListener('touchmove', onMove, { passive: false });
    root.addEventListener('touchend', onEnd);
    root.addEventListener('touchcancel', onEnd);
    return () => {
      root.removeEventListener('touchstart', onStart);
      root.removeEventListener('touchmove', onMove);
      root.removeEventListener('touchend', onEnd);
      root.removeEventListener('touchcancel', onEnd);
    };
  }, [onClose]);

  return (
    <div ref={rootRef} className="fixed inset-0 z-40 bg-bg-0 overflow-y-auto overscroll-contain screen-in">
      <div
        ref={barRef}
        data-solid={transparentTop ? '0' : '1'}
        className="sticky top-0 z-20 flex items-center gap-2 px-2 pb-2 transition-colors duration-200 data-[solid='1']:bg-bg-0/95 data-[solid='1']:backdrop-blur data-[solid='0']:bg-gradient-to-b data-[solid='0']:from-black/50 data-[solid='0']:to-transparent"
        style={{ paddingTop: 'max(0.5rem, env(safe-area-inset-top))' }}
      >
        <button onClick={onClose} aria-label="Back" className="p-2 rounded-full text-ink-0 active:bg-white/10">
          <Icon name="back" size={24} strokeWidth={2.4} />
        </button>
        <div
          ref={titleRef}
          className="flex-1 min-w-0 text-center text-[15px] font-semibold truncate transition-opacity duration-200"
          style={{ opacity: transparentTop ? 0 : 1 }}
        >
          {title}
        </div>
        <div className="min-w-[40px] flex justify-end">{right}</div>
      </div>
      <div className={transparentTop ? '-mt-[calc(56px+env(safe-area-inset-top))]' : ''}>{children}</div>
    </div>
  );
}
