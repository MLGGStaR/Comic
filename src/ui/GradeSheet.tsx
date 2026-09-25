// "Is it graded?" — log a slabbed copy: who graded it and the grade. Its value
// then follows that grade's market price instead of the raw one.
import { useEffect, useState } from 'react';
import { priceFor, type PriceEstimate } from '../api/prices';
import { collection } from '../state/collection';
import { copyValue } from '../lib/shelf';
import { fmtMoney } from '../lib/format';
import type { ComicLite, Grade, GradeCompany, OwnedVariant } from '../types';
import { Sheet } from './Sheet';
import { Cover } from './Cover';
import { toast } from './toast';

const COMPANIES: GradeCompany[] = ['CGC', 'CBCS', 'PGX', 'Other'];
const GRADES = [10, 9.9, 9.8, 9.6, 9.4, 9.2, 9.0, 8.5, 8.0, 7.5, 7.0, 6.5, 6.0, 5.5, 5.0, 4.5, 4.0, 3.5, 3.0, 2.5, 2.0, 1.8, 1.5, 1.0, 0.5];

export const gradeLabel = (g: Grade) => `${g.by === 'Other' ? 'Graded' : g.by} ${g.grade.toFixed(1)}`;

export function GradeSheet({ comic, cover, onClose }: { comic: ComicLite; cover: OwnedVariant; onClose: () => void }) {
  const [by, setBy] = useState<GradeCompany | 'Raw'>(cover.grade?.by ?? 'Raw');
  const [grade, setGrade] = useState(cover.grade?.grade ?? 9.8);
  const [price, setPrice] = useState<PriceEstimate | null | undefined>(undefined);

  useEffect(() => {
    let alive = true;
    priceFor(comic, cover.id === comic.id ? null : cover.name)
      .then((p) => alive && setPrice(p))
      .catch(() => alive && setPrice(null));
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const g: Grade | null = by === 'Raw' ? null : { by, grade };
  const worth = price ? copyValue(price, g) : null;
  const how = !worth
    ? null
    : worth.basis === 'exact'
      ? g
        ? `${gradeLabel(g)} sales`
        : 'raw copy sales'
      : worth.basis === 'between'
        ? `between the ${worth.from} sale prices`
        : worth.basis === 'floor'
          ? `no ${grade.toFixed(1)} sales data — the ${worth.from} price, as a floor`
          : 'no graded sales data — the raw price';

  const save = () => {
    const e = collection.entry(comic.id);
    if (!e) return onClose();
    void collection.patch(e.meta, { variants: e.variants.map((v) => (v.id === cover.id ? { ...v, grade: g } : v)) });
    toast(g ? `Logged as ${gradeLabel(g)}` : 'Logged as raw');
    onClose();
  };

  return (
    <Sheet onClose={onClose} label="Grade">
      <div className="flex gap-3 items-center mb-4">
        <div className="w-12 aspect-[2/3] rounded-md overflow-hidden bg-bg-2 flex-shrink-0">
          <Cover src={cover.cover ?? comic.cover} alt={cover.name} className="w-full h-full" />
        </div>
        <div className="min-w-0">
          <div className="text-[16px] font-semibold leading-snug">Is it graded?</div>
          <div className="text-xs text-ink-2 truncate">
            {comic.title} · {cover.name}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-5 gap-1.5 rounded-xl bg-bg-0/40 p-1" role="group" aria-label="Graded by">
        {(['Raw', ...COMPANIES] as const).map((c) => (
          <button
            key={c}
            onClick={() => setBy(c)}
            aria-pressed={by === c}
            className={`py-2 rounded-lg text-[13px] font-semibold ${by === c ? (c === 'Raw' ? 'bg-bg-2 text-ink-0' : 'bg-lb-blue text-bg-0') : 'text-ink-2'}`}
          >
            {c}
          </button>
        ))}
      </div>

      {by !== 'Raw' ? (
        <div className="grid grid-cols-5 gap-1.5 mt-3 max-h-[168px] overflow-y-auto" data-nodrag>
          {GRADES.map((n) => (
            <button
              key={n}
              onClick={() => setGrade(n)}
              aria-pressed={grade === n}
              className={`py-2 rounded-lg text-[14px] font-bold tabular-nums ${grade === n ? 'bg-lb-green text-bg-0' : 'bg-bg-2 text-ink-1'}`}
            >
              {n.toFixed(1)}
            </button>
          ))}
        </div>
      ) : null}

      <div className="mt-4 rounded-xl bg-bg-0/40 px-4 py-3 min-h-[64px]">
        {price === undefined ? (
          <div className="h-10 rounded skeleton" />
        ) : worth ? (
          <>
            <div className="flex items-baseline justify-between gap-3">
              <span className="text-xs text-ink-2">{g ? `Worth at ${gradeLabel(g)}` : 'Worth raw'}</span>
              <span className="font-display text-[22px] font-extrabold text-lb-green">{fmtMoney(worth.amount)}</span>
            </div>
            <div className="text-[11px] text-ink-2 mt-0.5">
              {how} · PriceCharting{price && !price.full && g && grade > 8 ? ' · every grade with a PriceCharting API token (Settings)' : ''}
            </div>
          </>
        ) : (
          <div className="text-xs text-ink-2">No market listing for this cover yet — it counts at cover price. You can set your own value on the comic’s page.</div>
        )}
      </div>

      <button onClick={save} className="w-full mt-4 btn-primary">
        Save
      </button>
    </Sheet>
  );
}
