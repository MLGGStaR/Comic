// One back stack for every closable layer (pushed screens, sheets, scanners),
// wired to browser history so Android's back button closes the top layer.
//
// History holds at most ONE extra "sentinel" entry while any layer is open:
// pushed when the first layer opens, consumed when the last one closes.
// Layers opening/closing in between never touch history, which avoids the
// back()/pushState() races that can unwind the page past the app.
import { useEffect, useRef } from 'react';

type Handler = () => void;
const stack: Handler[] = [];
let armed = false; // our sentinel entry is the current history entry
let ignoreNext = false; // the next popstate is our own programmatic back()
let pendingBack: ReturnType<typeof setTimeout> | null = null;

function arm() {
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
  pendingBack = setTimeout(() => {
    pendingBack = null;
    if (stack.length || !armed) return;
    armed = false;
    ignoreNext = true;
    history.back();
  }, 0);
}

if (typeof window !== 'undefined') {
  window.addEventListener('popstate', () => {
    if (ignoreNext) {
      ignoreNext = false;
      return;
    }
    if (!armed) return; // not our entry
    armed = false;
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

/** Close the topmost layer (edge swipe). */
export function popBack(): boolean {
  const top = stack[stack.length - 1];
  if (!top) return false;
  top();
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
