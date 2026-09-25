// Tap vs. hold on the same element (letterSizd's long-press pattern):
// hold 420ms without moving → onHold (with a tick of haptics), and the click
// that follows the release is swallowed so the tap action doesn't also fire.
import { useRef } from 'react';

export function usePress(onTap: () => void, onHold?: () => void) {
  const suppress = useRef(false);
  const tapRef = useRef(onTap);
  const holdRef = useRef(onHold);
  tapRef.current = onTap;
  holdRef.current = onHold;

  return {
    onPointerDown: (e: React.PointerEvent) => {
      if (!holdRef.current || (e.pointerType === 'mouse' && e.button !== 0)) return;
      const sx = e.clientX;
      const sy = e.clientY;
      const timer = window.setTimeout(() => {
        suppress.current = true;
        navigator.vibrate?.(12);
        holdRef.current?.();
        cleanup();
      }, 420);
      const onMove = (ev: PointerEvent) => {
        if (Math.hypot(ev.clientX - sx, ev.clientY - sy) > 9) cleanup();
      };
      const cleanup = () => {
        window.clearTimeout(timer);
        window.removeEventListener('pointermove', onMove);
        window.removeEventListener('pointerup', cleanup);
        window.removeEventListener('pointercancel', cleanup);
      };
      window.addEventListener('pointermove', onMove);
      window.addEventListener('pointerup', cleanup);
      window.addEventListener('pointercancel', cleanup);
    },
    onClick: (e: React.MouseEvent) => {
      if (suppress.current) {
        suppress.current = false;
        e.preventDefault();
        return;
      }
      tapRef.current();
    },
    onContextMenu: (e: React.MouseEvent) => e.preventDefault(),
  };
}
