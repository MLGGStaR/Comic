import { useRef } from 'react';

export function starsOf(r?: number | null): string {
  if (r == null) return '';
  const full = Math.floor(r);
  const half = r - full >= 0.5;
  return '★'.repeat(full) + (half ? '½' : '');
}

export function Stars({ value, className }: { value?: number | null; className?: string }) {
  if (value == null) return null;
  return <div className={`stars ${className ?? ''}`}>{starsOf(value)}</div>;
}

// Drag across the stars to set a rating in half steps (Letterboxd feel).
export function StarPicker({
  value,
  onChange,
  size = 34,
}: {
  value: number;
  onChange: (v: number) => void;
  size?: number;
}) {
  const ref = useRef<HTMLDivElement | null>(null);
  const pick = (clientX: number) => {
    const el = ref.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const frac = Math.min(1, Math.max(0, (clientX - r.left) / r.width));
    onChange(Math.max(0.5, Math.round(frac * 10) / 2));
  };
  return (
    <div className="flex justify-center py-1.5">
      <div
        ref={ref}
        role="slider"
        aria-label="Rating"
        aria-valuemin={0.5}
        aria-valuemax={5}
        aria-valuenow={value || undefined}
        className="inline-flex gap-1 touch-none"
        onPointerDown={(e) => {
          (e.currentTarget as Element).setPointerCapture?.(e.pointerId);
          pick(e.clientX);
        }}
        onPointerMove={(e) => e.buttons > 0 && pick(e.clientX)}
      >
        {[1, 2, 3, 4, 5].map((i) => (
          <span key={i} className="relative leading-none select-none" style={{ fontSize: size }}>
            <span className="text-bg-2">★</span>
            <span
              className="absolute inset-0 overflow-hidden text-lb-green"
              style={{ width: value >= i ? '100%' : value >= i - 0.5 ? '50%' : '0%' }}
            >
              ★
            </span>
          </span>
        ))}
      </div>
    </div>
  );
}
