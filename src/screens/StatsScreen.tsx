// Reading stats. Chart colors are the dataviz-validated pair for this dark
// surface: GREEN #0fb33d (single-series marks) and BLUE #2b99da (second
// category) — never brand green + orange together (fails deutan).
import { useMemo, useState } from 'react';
import { Screen } from '../ui/Screen';
import { useUserEntries } from '../state/userEntries';
import { profileById, useProfiles } from '../state/profiles';
import { useActions } from '../state/actions';
import { RatingHistogram } from '../ui/RatingHistogram';
import { SectionHeader, Stat, Empty } from '../ui/layout';
import type { Entry } from '../types';

const GREEN = '#0fb33d';
const BLUE = '#2b99da';

export function StatsScreen({ userId, onClose }: { userId: string; onClose: () => void }) {
  useProfiles();
  const a = useActions();
  const { entries } = useUserEntries(userId);
  const who = a.selfId === userId ? null : profileById(userId)?.username;
  const s = useMemo(() => computeStats(entries), [entries]);
  const [rating, setRating] = useState<number | 'any'>('any');

  return (
    <Screen onClose={onClose} title={who ? `${who} · Stats` : 'Stats'}>
      <div className="px-4 pb-24 space-y-8">
        <div className="flex justify-between items-end">
          <Stat value={s.read.length} label="read" />
          <Stat value={s.thisYear} label="this year" accent />
          <Stat value={s.avg ? s.avg.toFixed(1) : '—'} label="avg ★" />
          <Stat value={s.seriesCount} label="series" />
        </div>

        {!s.read.length ? <Empty title="No reads yet">Rate or mark comics as read to fill this page.</Empty> : null}

        {s.read.length ? (
          <section>
            <SectionHeader>Read per month</SectionHeader>
            <MonthBars months={s.months} />
          </section>
        ) : null}

        {s.rated ? (
          <section>
            <SectionHeader>Ratings</SectionHeader>
            <RatingHistogram countFor={(t) => s.read.filter((e) => e.rating === t).length} active={rating} onSelect={setRating} />
          </section>
        ) : null}

        {s.publishers.length ? (
          <section>
            <SectionHeader>Publishers</SectionHeader>
            <HBars rows={s.publishers} />
          </section>
        ) : null}

        {s.series.length ? (
          <section>
            <SectionHeader>Most-read series</SectionHeader>
            <HBars rows={s.series} />
          </section>
        ) : null}

        {s.read.length ? (
          <section>
            <SectionHeader>Issues vs collected</SectionHeader>
            <FormatSplit issues={s.issues} collected={s.collected} />
          </section>
        ) : null}
      </div>
    </Screen>
  );
}

function computeStats(entries: Entry[]) {
  const read = entries.filter((e) => e.read);
  const year = new Date().getFullYear();
  const rated = read.filter((e) => e.rating != null);
  const now = new Date();
  const months: { key: string; label: string; full: string; n: number }[] = [];
  for (let i = 11; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    months.push({
      key,
      label: d.toLocaleDateString(undefined, { month: 'narrow' }),
      full: d.toLocaleDateString(undefined, { month: 'short', year: 'numeric' }),
      n: 0,
    });
  }
  const idx = new Map(months.map((m, i) => [m.key, i]));
  for (const e of read) {
    const i = idx.get((e.readAt ?? '').slice(0, 7));
    if (i != null) months[i].n++;
  }
  const count = (key: (e: Entry) => string | null) => {
    const m = new Map<string, number>();
    for (const e of read) {
      const k = key(e);
      if (k) m.set(k, (m.get(k) ?? 0) + 1);
    }
    return [...m.entries()].map(([label, n]) => ({ label, n })).sort((x, y) => y.n - x.n);
  };
  const series = count((e) => e.meta.series);
  return {
    read,
    thisYear: read.filter((e) => (e.readAt ?? '').startsWith(String(year))).length,
    rated: rated.length,
    avg: rated.length ? rated.reduce((t, e) => t + (e.rating ?? 0), 0) / rated.length : 0,
    months,
    publishers: count((e) => e.meta.publisher).slice(0, 6),
    series: series.slice(0, 8),
    seriesCount: series.length,
    issues: read.filter((e) => e.meta.format === 'issue').length,
    collected: read.filter((e) => e.meta.format === 'collection').length,
  };
}

function MonthBars({ months }: { months: { key: string; label: string; full: string; n: number }[] }) {
  const [hot, setHot] = useState<number | null>(null);
  const max = Math.max(1, ...months.map((m) => m.n));
  const peak = months.reduce((b, m, i) => (m.n > months[b].n ? i : b), 0);
  const H = 120;
  return (
    <div className="select-none" data-nopull>
      <div
        className="relative flex items-end gap-[2px]"
        style={{ height: H, touchAction: 'none' }}
        onPointerLeave={() => setHot(null)}
        onPointerUp={() => window.setTimeout(() => setHot(null), 1400)}
      >
        {months.map((m, i) => {
          const h = m.n ? Math.max(4, (m.n / max) * (H - 22)) : 0;
          const show = hot === i || (hot == null && i === peak && m.n > 0);
          return (
            <div
              key={m.key}
              className="flex-1 h-full flex flex-col justify-end items-center relative"
              onPointerDown={() => setHot(i)}
              onPointerEnter={() => setHot(i)}
            >
              {show ? (
                <div
                  className={`absolute text-[10px] font-bold whitespace-nowrap z-10 ${
                    hot === i ? 'bg-bg-2 border border-white/10 rounded-md px-1.5 py-0.5 shadow-lg text-ink-0' : 'text-ink-1'
                  }`}
                  style={{ bottom: h + 4 }}
                >
                  {hot === i ? `${m.full} · ${m.n}` : m.n}
                </div>
              ) : null}
              <div
                className="w-full rounded-t-[4px] transition-opacity"
                style={{ height: h, background: GREEN, opacity: hot == null || hot === i ? 1 : 0.4 }}
              />
            </div>
          );
        })}
      </div>
      <div className="h-px bg-white/10" />
      <div className="flex gap-[2px] mt-1">
        {months.map((m) => (
          <div key={m.key} className="flex-1 text-center text-[10px] text-ink-2">
            {m.label}
          </div>
        ))}
      </div>
    </div>
  );
}

function HBars({ rows }: { rows: { label: string; n: number }[] }) {
  const max = Math.max(1, ...rows.map((r) => r.n));
  return (
    <div className="space-y-2">
      {rows.map((r) => (
        <div key={r.label} className="flex items-center gap-2">
          <div className="w-[38%] min-w-0 text-xs text-ink-1 truncate">{r.label}</div>
          <div className="flex-1 flex items-center gap-2">
            <div className="h-3 rounded-r-[4px]" style={{ width: `${Math.max(3, (r.n / max) * 100)}%`, background: GREEN }} />
            <span className="text-[11px] font-semibold text-ink-0">{r.n}</span>
          </div>
        </div>
      ))}
    </div>
  );
}

function FormatSplit({ issues, collected }: { issues: number; collected: number }) {
  const total = Math.max(1, issues + collected);
  return (
    <div>
      <div className="flex gap-[2px] h-3 rounded-full overflow-hidden">
        {issues ? <div style={{ width: `${(issues / total) * 100}%`, background: GREEN }} /> : null}
        {collected ? <div style={{ width: `${(collected / total) * 100}%`, background: BLUE }} /> : null}
      </div>
      <div className="flex justify-between mt-2 text-xs">
        <span className="flex items-center gap-1.5 text-ink-1">
          <span className="w-2 h-2 rounded-full" style={{ background: GREEN }} />
          Issues <b className="text-ink-0">{issues}</b>
        </span>
        <span className="flex items-center gap-1.5 text-ink-1">
          <span className="w-2 h-2 rounded-full" style={{ background: BLUE }} />
          Collected <b className="text-ink-0">{collected}</b>
        </span>
      </div>
    </div>
  );
}
