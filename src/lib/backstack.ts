// One back stack for every closable layer (pushed screens, sheets, scanners),
// kept in sync with browser history so Android's back button, the in-app
// edge swipe and on-screen ✕ buttons all close the topmost layer.
import { useEffect, useRef } from 'react';

type Handler = () => void;
const stack: Handler[] = [];
let ignorePops = 0;

if (typeof window !== 'undefined') {
  window.addEventListener('popstate', () => {
    if (ignorePops > 0) {
      ignorePops--;
      return;
    }
    stack.pop()?.();
  });
}

/** Register a layer; returns the cleanup to call when the layer unmounts. */
export function pushBack(handler: Handler): () => void {
  stack.push(handler);
  try {
    history.pushState({ longbox: stack.length }, '');
  } catch {
    // history unavailable (sandboxed) — the stack still works for gestures
  }
  return () => {
    const i = stack.indexOf(handler);
    if (i < 0) return; // already closed by a popstate
    stack.splice(i, 1);
    ignorePops++;
    history.back(); // consume the entry this layer pushed
  };
}

/** Close the topmost layer (edge swipe, ✕ buttons). */
export function popBack(): boolean {
  if (!stack.length) return false;
  history.back();
  return true;
}

export function hasBack(): boolean {
  return stack.length > 0;
}

/** Hook form: registers once, always calls the latest onClose. */
export function useBackLayer(onClose: () => void, active = true) {
  const ref = useRef(onClose);
  ref.current = onClose;
  useEffect(() => {
    if (!active) return;
    return pushBack(() => ref.current());
  }, [active]);
}
