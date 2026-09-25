// Release calendar: a month grid where each day shows its top cover and how
// many books land that day. Tap a day to open its full list below. Days with
// new issues of your series get a green dot. Swipe the grid to change month.
import { useEffect, useMemo, useRef, useState } from 'react';
import { api } from '../api/client';
import type { ComicLite } from '../types';
import { useMySeries } from '../state/mySeries';
import { useOnRefresh } from '../state/refresh';
import { monthGrid, weeksCovering, toIso, fromIso, weekStart } from '../lib/dates';
import { Cover } from '../ui/Cover';
import { Icon } from '../ui/Icon';
import { ComicTile } from '../ui/ComicTile';
import { Segmented, Empty } from '../ui/layout';

type Scope = 'all' | 'mine';
type Fmt = 'all' | 'issue' | 'collection';
type Sort = 'popular' | 'az' | 'publisher';

const MAIN_PUBS = ['DC Comics', 'Marvel Comics', 'Image Comics', 'Dark Horse Comics', 'BOOM! Studios', 'IDW Publishing'];
const MANGA = /\b(VIZ|Seven Seas|Kodansha|Yen Press|Shueisha|Square Enix|Tokyopop|J-Novel|Denpa|Vertical|Ghost Ship|Airship|Kaiten|One Peace|Udon)\b/i;

export function CalendarView() {
  const today = toIso(new Date());
  const [ym, setYm] = useState(() => {
    const d = new Date();
    return { y: d.getFullYear(), m: d.getMonth() };
  });
  const [byWeek, setByWeek] = useState<Record<string, ComicLite[]>>({});
  const [failed, setFailed] = useState<string[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [scope, setScope] = useState<Scope>(() => (localStorage.getItem('lbx-cal-scope') as Scope) || 'all');
  const [fmt, setFmt] = useState<Fmt>('all');
  // 'comics' (default) hides manga volumes; 'all' shows everything
  const [pub, setPub] = useState(() => localStorage.getItem('lbx-cal-pub') || 'comics');
  const [sort, setSort] = useState<Sort>('popular');
  const [limit, setLimit] = useState(40);
  const mine = useMySeries();

  useEffect(() => localStorage.setItem('lbx-cal-scope', scope), [scope]);
  useEffect(() => localStorage.setItem('lbx-cal-pub', pub), [pub]);

  const grid = useMemo(() => monthGrid(ym.y, ym.m), [ym]);
  const weeks = useMemo(() => weeksCovering(grid[0], grid[41]), [grid]);
  const monthKey = `${ym.y}-${String(ym.m + 1).padStart(2, '0')}`;

  const load = async (force = false) => {
    setFailed([]);
    await Promise.all(
      weeks.map(async (w) => {
        if (!force && byWeek[w]) return;
        try {
          const list = await api.week(w);
          setByWeek((prev) => ({ ...prev, [w]: list }));
        } catch {
          setFailed((f) => [...f, w]);
        }
      }),
    );
  };
  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [weeks]);
  useOnRefresh(() => load(true));

  // every release placed on its own date
  const byDay = useMemo(() => {
    const out = new Map<string, ComicLite[]>();
    for (const w of weeks) {
      for (const c of byWeek[w] ?? []) {
        const d = c.releaseDate ?? w;
        const list = out.get(d) ?? [];
        list.push(c);
        out.set(d, list);
      }
    }
    return out;
  }, [byWeek, weeks]);

  const pubOk = (p: string) =>
    pub === 'all' ? true : pub === 'comics' ? !MANGA.test(p) : pub === 'other' ? !MAIN_PUBS.includes(p) && !MANGA.test(p) : p === pub;
  const passes = (c: ComicLite) => (scope === 'all' || mine(c)) && (fmt === 'all' || c.format === fmt) && pubOk(c.publisher ?? '');

  const dayList = (d: string) => (byDay.get(d) ?? []).filter(passes);

  // default selection: this release week's Wednesday in the current month,
  // else the first day of the month that has releases
  useEffect(() => {
    if (selected && selected.startsWith(monthKey)) return;
    const wed = weekStart(new Date());
    if (wed.startsWith(monthKey) && (byDay.get(wed)?.length ?? 0) > 0) return setSelected(wed);
    if (today.startsWith(monthKey) && (byDay.get(today)?.length ?? 0) > 0) return setSelected(today);
    const first = grid.find((d) => d.startsWith(monthKey) && (byDay.get(d)?.length ?? 0) > 0);
    if (first) setSelected(first);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [monthKey, byDay]);

  useEffect(() => setLimit(40), [selected, scope, fmt, pub, sort]);

  const shift = (n: number) =>
    setYm(({ y, m }) => {
      const d = new Date(y, m + n, 1);
      return { y: d.getFullYear(), m: d.getMonth() };
    });

  // swipe the grid horizontally to change month
  const touch = useRef<{ x: number; y: number } | null>(null);

  const monthName = new Date(ym.y, ym.m, 1).toLocaleDateString(undefined, { month: 'long' });
  const loadingMonth = weeks.some((w) => !byWeek[w] && !failed.includes(w));

  const sel = selected ? dayList(selected) : [];
  const sorted = useMemo(() => {
    const list = [...sel];
    const pin = (c: ComicLite) => (mine(c) ? 0 : 1);
    list.sort((a, b) => {
      const p = pin(a) - pin(b);
      if (p) return p;
      if (sort === 'az') return a.title.localeCompare(b.title);
      if (sort === 'publisher') return (a.publisher ?? '').localeCompare(b.publisher ?? '') || (b.pulls ?? 0) - (a.pulls ?? 0);
      return (b.pulls ?? 0) - (a.pulls ?? 0);
    });
    return list;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sel.length, selected, sort, mine, scope, fmt, pub, byDay]);
  const pinnedCount = sorted.filter(mine).length;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between px-1">
        <div>
          <div className="font-display text-[28px] font-extrabold leading-none">{monthName}</div>
          <div className="text-xs text-ink-2 mt-1">{ym.y}</div>
        </div>
        <div className="flex items-center gap-1">
          {!today.startsWith(monthKey) ? (
            <button
              onClick={() => {
                const d = new Date();
                setYm({ y: d.getFullYear(), m: d.getMonth() });
                setSelected(null);
              }}
              className="px-3 py-1.5 rounded-full bg-bg-1 text-xs font-semibold text-lb-green mr-1"
            >
              Today
            </button>
          ) : null}
          <button onClick={() => shift(-1)} aria-label="Previous month" className="p-2 rounded-full bg-bg-1 text-ink-1">
            <Icon name="chevron-left" size={18} />
          </button>
          <button onClick={() => shift(1)} aria-label="Next month" className="p-2 rounded-full bg-bg-1 text-ink-1">
            <Icon name="chevron-right" size={18} />
          </button>
        </div>
      </div>

      <div className="flex gap-2">
        <Segmented
          value={scope}
          onChange={setScope}
          options={[
            ['all', 'Everything'],
            ['mine', 'My series'],
          ]}
          className="flex-1"
        />
      </div>
      <div className="grid grid-cols-2 gap-2">
        <select
          value={pub}
          onChange={(e) => setPub(e.target.value)}
          className={`bg-bg-1 rounded-xl px-3 py-2 text-[13px] font-semibold ${pub !== 'comics' ? 'text-lb-green' : 'text-ink-0'}`}
        >
          <option value="comics">All comics</option>
          <option value="all">Comics + manga</option>
          {MAIN_PUBS.map((p) => (
            <option key={p} value={p}>
              {p.replace(' Comics', '').replace(' Publishing', '')}
            </option>
          ))}
          <option value="other">Other publishers</option>
        </select>
        <select
          value={fmt}
          onChange={(e) => setFmt(e.target.value as Fmt)}
          className={`bg-bg-1 rounded-xl px-3 py-2 text-[13px] font-semibold ${fmt !== 'all' ? 'text-lb-green' : 'text-ink-0'}`}
        >
          <option value="all">Issues + trades</option>
          <option value="issue">Issues only</option>
          <option value="collection">Trades & HCs</option>
        </select>
      </div>

      <div
        data-nopull
        className="rounded-2xl bg-bg-1/60 border border-white/[0.05] p-1.5 select-none"
        onTouchStart={(e) => (touch.current = { x: e.touches[0].clientX, y: e.touches[0].clientY })}
        onTouchEnd={(e) => {
          const t = touch.current;
          touch.current = null;
          if (!t) return;
          const dx = e.changedTouches[0].clientX - t.x;
          const dy = e.changedTouches[0].clientY - t.y;
          if (Math.abs(dx) > 60 && Math.abs(dx) > Math.abs(dy) * 1.5) shift(dx < 0 ? 1 : -1);
        }}
      >
        <div className="grid grid-cols-7 mb-1">
          {['S', 'M', 'T', 'W', 'T', 'F', 'S'].map((d, i) => (
            <div key={i} className={`text-center text-[10px] font-semibold py-1 ${i === 3 ? 'text-lb-green/80' : 'text-ink-2'}`}>
              {d}
            </div>
          ))}
        </div>
        <div className="grid grid-cols-7 gap-1">
          {grid.map((d) => {
            const inMonth = d.startsWith(monthKey);
            const list = dayList(d);
            const n = list.length;
            const top = n ? [...list].sort((a, b) => (b.pulls ?? 0) - (a.pulls ?? 0))[0] : null;
            const hasMine = list.some(mine);
            const isSel = d === selected;
            const isToday = d === today;
            return (
              <button
                key={d}
                onClick={() => n && setSelected(d)}
                aria-label={`${d}: ${n} releases`}
                className={`relative rounded-xl h-[70px] flex flex-col items-center pt-1 transition-colors ${
                  isSel ? 'bg-bg-2 ring-1 ring-lb-green/70' : n ? 'active:bg-bg-2/70' : ''
                } ${inMonth ? '' : 'opacity-35'}`}
              >
                <span
                  className={`text-[11px] font-semibold leading-none w-5 h-5 flex items-center justify-center rounded-full ${
                    isToday ? 'bg-lb-green text-bg-0' : 'text-ink-1'
                  }`}
                >
                  {fromIso(d).getDate()}
                </span>
                {top ? (
                  <>
                    <div className="mt-1 w-[26px] aspect-[2/3] rounded-[3px] overflow-hidden bg-bg-2 shadow">
                      <Cover src={top.cover} alt="" className="w-full h-full" />
                    </div>
                    <span className="text-[9px] font-bold text-ink-2 leading-none mt-0.5">{n}</span>
                  </>
                ) : null}
                {hasMine ? <span className="absolute top-1 right-1 w-1.5 h-1.5 rounded-full bg-lb-green shadow-[0_0_6px_rgba(0,215,53,0.9)]" /> : null}
              </button>
            );
          })}
        </div>
        {loadingMonth ? <div className="text-center text-[10px] text-ink-2 pt-2">Loading releases…</div> : null}
        {failed.length && !loadingMonth ? (
          <button onClick={() => void load(true)} className="w-full text-center text-[11px] text-amber-300 pt-2">
            Some weeks didn't load — tap to retry
          </button>
        ) : null}
      </div>

      {selected ? (
        <section key={selected} className="fade-in">
          <div className="flex items-end justify-between px-1 mb-3">
            <div>
              <div className="font-display text-lg font-extrabold leading-tight">
                {fromIso(selected).toLocaleDateString(undefined, { weekday: 'long', month: 'short', day: 'numeric' })}
              </div>
              <div className="text-xs text-ink-2 mt-0.5">
                {sorted.length} release{sorted.length === 1 ? '' : 's'}
                {pinnedCount ? <span className="text-lb-green"> · {pinnedCount} from your series</span> : null}
              </div>
            </div>
            <select value={sort} onChange={(e) => setSort(e.target.value as Sort)} className="bg-bg-1 rounded-lg px-2 py-1.5 text-xs font-semibold">
              <option value="popular">Popular</option>
              <option value="az">A→Z</option>
              <option value="publisher">Publisher</option>
            </select>
          </div>
          {sorted.length ? (
            <>
              <div className="grid grid-cols-4 gap-2">
                {sorted.slice(0, limit).map((c) => (
                  <ComicTile
                    key={c.id}
                    comic={c}
                    showStatus
                    label={mine(c) ? 'Pull' : c.format === 'collection' ? 'TPB' : undefined}
                    labelTone={mine(c) ? 'green' : 'dark'}
                  />
                ))}
              </div>
              {sorted.length > limit ? (
                <button onClick={() => setLimit((l) => l + 80)} className="w-full mt-3 py-2.5 rounded-xl bg-bg-1 text-xs font-semibold text-ink-1">
                  Show {Math.min(80, sorted.length - limit)} more
                </button>
              ) : null}
            </>
          ) : (
            <Empty title="Nothing here with these filters" />
          )}
        </section>
      ) : !loadingMonth ? (
        <Empty title={scope === 'mine' ? 'None of your series this month' : 'No releases listed yet'}>
          {scope === 'mine' ? 'Follow a series from its page, or switch to Everything.' : 'Solicitations usually appear about 2–3 months ahead.'}
        </Empty>
      ) : null}
    </div>
  );
}
