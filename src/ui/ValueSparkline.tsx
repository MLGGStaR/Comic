// Collection value over time: one point per day, recorded whenever the
// app sees your collection, drawn as a soft area sparkline.
import { useEffect, useState } from 'react';
import { supabase } from '../supabase';
import { isoDay } from '../lib/entry';

export interface ValuePoint {
  day: string;
  value: number;
}

export function useValueHistory(userId: string | null): ValuePoint[] {
  const [points, setPoints] = useState<ValuePoint[]>([]);
  useEffect(() => {
    if (!userId) return;
    let alive = true;
    const since = isoDay(new Date(Date.now() - 365 * 86400000));
    supabase
      .from('comic_value_history')
      .select('day, value')
      .eq('user_id', userId)
      .gte('day', since)
      .order('day')
      .then(({ data }) => {
        if (alive && data) setPoints((data as { day: string; value: number | string }[]).map((r) => ({ day: r.day, value: Number(r.value) })));
      });
    return () => {
      alive = false;
    };
  }, [userId]);
  return points;
}

let lastSaved = '';
export async function recordValue(userId: string, value: number, items: number) {
  const day = isoDay(new Date());
  const key = `${userId}|${day}|${value}|${items}`;
  if (key === lastSaved) return;
  lastSaved = key;
  await supabase.from('comic_value_history').upsert({ user_id: userId, day, value, items });
}

export function ValueSparkline({ points, height = 48 }: { points: ValuePoint[]; height?: number }) {
  if (points.length < 2) return null;
  const w = 300;
  const h = height;
  const vals = points.map((p) => p.value);
  const min = Math.min(...vals);
  const max = Math.max(...vals);
  const span = max - min || 1;
  const xy = points.map((p, i) => [
    (i / (points.length - 1)) * w,
    h - 4 - ((p.value - min) / span) * (h - 10),
  ]);
  const line = xy.map(([x, y], i) => `${i ? 'L' : 'M'}${x.toFixed(1)} ${y.toFixed(1)}`).join(' ');
  const area = `${line} L${w} ${h} L0 ${h} Z`;
  const up = vals[vals.length - 1] >= vals[0];
  const c = up ? '#00d735' : '#ff6b6b';
  return (
    <svg viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" className="w-full" style={{ height }} aria-hidden>
      <defs>
        <linearGradient id="vs-fill" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor={c} stopOpacity="0.28" />
          <stop offset="1" stopColor={c} stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={area} fill="url(#vs-fill)" />
      <path d={line} fill="none" stroke={c} strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
    </svg>
  );
}
