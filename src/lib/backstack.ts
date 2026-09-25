// One back stack for every closable layer (pushed screens, sheets, scanners),
// wired to browser history so Android's back button closes the top layer.
//
// History holds at most ONE extra "sentinel" entry while any layer is open:
// pushed when the first layer opens, consumed when the last one closes.
// Layers opening/closing in between never touch history, which avoids the
// back()/pushState() races that can unwind the page past the app.
//
// The home-screen app on iOS gets no history entries at all: there's no back
// button, and iOS's own edge-swipe gesture would walk those entries —
// animating a snapshot of the page under every layer and closing a second
// layer on top of our own swipe. There, the edge swipe in <Screen> is the one
// way back and closes exactly one. (In a Safari tab the entries stay, so the
// browser's swipe closes a layer instead of leaving the site; a browser back
// right after our own swipe is recognised as the same gesture.)
import { useEffect, useRef } from 'react';

type Handler = () => void;
const stack: Handler[] = [];
let armed = false; // our sentinel entry is the current history entry
let ignoreNext = false; // the next popstate is our own programmatic back()
let pendingBack: ReturnType<typeof setTimeout> | null = null;
let swipedAt = 0; // when an edge swipe last closed a layer

const SAME_GESTURE_MS = 1000;

export function isIOS(): boolean {
  if (typeof navigator === 'undefined') return false;
  return /iP(hone|ad|od)/.test(navigator.userAgent) || (/Macintosh/.test(navigator.userAgent) && navigator.maxTouchPoints > 1);
}
function isStandalone(): boolean {
  return (navigator as Navigator & { standalone?: boolean }).standalone === true || !!window.matchMedia?.('(display-mode: standalone)').matches;
}
const useHistory = typeof window !== 'undefined' && !(isIOS() && isStandalone());

function arm() {
  if (!useHistory) return;
  if (pendingBack) {
    // a layer closed and another opened in the same tick: keep the sentinel
    clearTimeout(pendingBack);
    pendingBack = null;
    return;
  }
  if (armed) return;
  try {
    history.pushState({ longbox: true }, '');
    armed = true;
  } catch {
    // history unavailable — gestures and ✕ buttons still work
  }
}

function disarmSoon() {
  if (pendingBack || !armed) return;
  // right after an edge swipe the browser may still deliver its own back
  // gesture for it; wait so the two never step back twice
  const wait = Date.now() - swipedAt < SAME_GESTURE_MS ? 700 : 0;
  pendingBack = setTimeout(() => {
    pendingBack = null;
    if (stack.length || !armed) return;
    armed = false;
    ignoreNext = true;
    history.back();
  }, wait);
}

if (useHistory) {
  window.addEventListener('popstate', () => {
    if (ignoreNext) {
      ignoreNext = false;
      return;
    }
    if (!armed) return; // not our entry
    armed = false;
    if (pendingBack) {
      // we were about to step back ourselves — the browser just did it
      clearTimeout(pendingBack);
      pendingBack = null;
      return;
    }
    if (Date.now() - swipedAt < SAME_GESTURE_MS) {
      // the browser's own back for the swipe we already handled
      if (stack.length) arm();
      return;
    }
    const top = stack.pop();
    top?.();
    if (stack.length) arm(); // keep a sentinel for the next back press
  });
}

/** Register a layer; returns the cleanup to call when the layer unmounts. */
export function pushBack(handler: Handler): () => void {
  stack.push(handler);
  arm();
  return () => {
    const i = stack.indexOf(handler);
    if (i < 0) return; // already closed by a back press
    stack.splice(i, 1);
    if (!stack.length) disarmSoon();
  };
}

/** Close the topmost layer. */
export function popBack(): boolean {
  const top = stack[stack.length - 1];
  if (!top) return false;
  top();
  return true;
}

/** An edge swipe is closing a layer (so a browser back right after is the same gesture). */
export function markSwipeBack() {
  swipedAt = Date.now();
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
