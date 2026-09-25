import type { ReactNode } from 'react';

// Gold→coral uppercase section headers — letterSizd's Home voice.
export function SectionHeader({ children, action }: { children: ReactNode; action?: ReactNode }) {
  return (
    <div className="flex items-center gap-3 mb-2.5">
      <h2
        className="font-display text-[15px] font-extrabold uppercase tracking-[0.14em] whitespace-nowrap"
        style={{
          background: 'linear-gradient(90deg, #ffb340, #ff5e62)',
          WebkitBackgroundClip: 'text',
          backgroundClip: 'text',
          color: 'transparent',
        }}
      >
        {children}
      </h2>
      <div className="flex-1 h-px bg-white/[0.07]" />
      {action}
    </div>
  );
}

// Horizontal snap row that bleeds to the screen edges.
export function Row({ children }: { children: ReactNode }) {
  return (
    <div className="flex gap-2.5 overflow-x-auto snap-x snap-proximity overscroll-x-contain pb-1 -mx-3 px-3">
      {children}
    </div>
  );
}

export function Stat({ value, label, accent }: { value: ReactNode; label: string; accent?: boolean }) {
  return (
    <div className="text-left min-w-0">
      <div
        className={`font-display text-[28px] font-extrabold leading-none tracking-tight truncate ${
          accent ? 'text-lb-green' : ''
        }`}
      >
        {value}
      </div>
      <div className="text-[10px] uppercase tracking-[0.14em] text-ink-2 mt-1">{label}</div>
    </div>
  );
}

export function Empty({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div className="text-center py-12 px-6">
      <div className="text-sm font-semibold text-ink-0 mb-1">{title}</div>
      {children ? <div className="text-xs text-ink-2 leading-relaxed">{children}</div> : null}
    </div>
  );
}

export function Segmented<T extends string>({
  value,
  options,
  onChange,
  className,
}: {
  value: T;
  options: [T, string][];
  onChange: (v: T) => void;
  className?: string;
}) {
  return (
    <div className={`flex bg-bg-1 rounded-xl p-0.5 ${className ?? ''}`}>
      {options.map(([k, label]) => (
        <button
          key={k}
          onClick={() => onChange(k)}
          className={`flex-1 px-3 py-1.5 rounded-[10px] text-[13px] font-semibold whitespace-nowrap ${
            value === k ? 'bg-bg-2 text-ink-0' : 'text-ink-2'
          }`}
        >
          {label}
        </button>
      ))}
    </div>
  );
}
