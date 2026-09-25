// Tiny toast queue: one line, bottom of the screen, above the tab bar.
import { useEffect, useState, useSyncExternalStore } from 'react';

type Kind = 'ok' | 'error';
interface ToastItem {
  id: number;
  text: string;
  kind: Kind;
}

let items: ToastItem[] = [];
let seq = 0;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());

export function toast(text: string, kind: Kind = 'ok') {
  const id = ++seq;
  items = [...items.slice(-2), { id, text, kind }];
  emit();
  window.setTimeout(() => {
    items = items.filter((t) => t.id !== id);
    emit();
  }, kind === 'error' ? 4200 : 2200);
}

export function Toasts() {
  const list = useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => items,
  );
  return (
    <div
      className="fixed inset-x-0 z-[60] flex flex-col items-center gap-2 pointer-events-none px-6"
      style={{ bottom: 'calc(92px + env(safe-area-inset-bottom))' }}
    >
      {list.map((t) => (
        <ToastPill key={t.id} item={t} />
      ))}
    </div>
  );
}

function ToastPill({ item }: { item: ToastItem }) {
  const [shown, setShown] = useState(false);
  useEffect(() => {
    const r = requestAnimationFrame(() => setShown(true));
    return () => cancelAnimationFrame(r);
  }, []);
  return (
    <div
      role="status"
      className={`max-w-sm px-4 py-2.5 rounded-full text-[13px] font-semibold shadow-[0_10px_30px_rgba(0,0,0,0.5)] border transition-all duration-200 ${
        shown ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-2'
      } ${item.kind === 'error' ? 'bg-bg-1 border-red-400/40 text-red-300' : 'bg-bg-1 border-lb-green/35 text-ink-0'}`}
    >
      {item.text}
    </div>
  );
}
