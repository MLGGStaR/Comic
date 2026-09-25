// Portfolio: what the collection is worth, how that's changed, where the
// value sits (publishers, top books) and how each number was estimated.
import { useMemo, useState } from 'react';
import { Screen } from '../ui/Screen';
import { useUserEntries } from '../state/userEntries';
import { profileById, useProfiles } from '../state/profiles';
import { useActions } from '../state/actions';
import { portfolio, valueOf } from '../lib/shelf';
import { fmtMoney } from '../lib/format';
import { Cover } from '../ui/Cover';
import { SectionHeader } from '../ui/layout';
import { ValueSparkline, useValueHistory } from '../ui/ValueSparkline';
import { refreshValues, useValueRefresh } from '../state/values';

const BASIS_UI = {
  market: { label: 'Market', color: '#00d735' },
  cover: { label: 'Cover price', color: '#40bcf4' },
  yours: { label: 'Your value', color: '#ff8000' },
  none: { label: 'No data', color: '#4a5877' },
} as const;

export function PortfolioScreen({ userId, onClose }: { userId: string; onClose: () => void }) {
  useProfiles();
  const a = useActions();
  const { entries } = useUserEntries(userId);
  const isSelf = a.selfId === userId;
  const who = isSelf ? null : profileById(userId)?.username;
  const p = useMemo(() => portfolio(entries), [entries]);
  const history = useValueHistory(userId);
  const refresh = useValueRefresh();
  const [showAll, setShowAll] = useState(false);

  const gain = p.paid > 0 ? p.total - p.paid : null;
  const first = history[0]?.value;
  const change = first != null && history.length > 1 ? p.total - first : null;
  const counted = p.basis.market + p.basis.cover + p.basis.yours + p.basis.none;
  const maxPub = Math.max(1, ...p.byPublisher.map((x) => x.value));
  const top = showAll ? p.top : p.top.slice(0, 10);

  return (
    <Screen onClose={onClose} title={who ? `${who} · Portfolio` : 'Portfolio'}>
      <div className="px-4 pb-24 space-y-7">
        <section className="pt-1">
          <div className="text-[10px] uppercase tracking-[0.16em] text-ink-2 font-semibold">Estimated value{who ? ` · ${who}` : ''}</div>
          <div className="font-display text-[46px] font-extrabold leading-none tracking-tight mt-2">{fmtMoney(p.total)}</div>
          <div className="flex flex-wrap gap-x-3 gap-y-1 text-xs mt-2">
            <span className="text-ink-1">
              {p.owned} comic{p.owned === 1 ? '' : 's'}
            </span>
            {gain != null ? (
              <span className={gain >= 0 ? 'text-lb-green' : 'text-red-400'}>
                {gain >= 0 ? '+' : '−'}
                {fmtMoney(Math.abs(gain))} vs {fmtMoney(p.paid)} paid
              </span>
            ) : null}
            {change != null && Math.abs(change) >= 0.01 ? (
              <span className={change >= 0 ? 'text-lb-green' : 'text-red-400'}>
                {change >= 0 ? '▲' : '▼'} {fmtMoney(Math.abs(change))} since {new Date(history[0].day).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
              </span>
            ) : null}
          </div>
          {history.length > 1 ? (
            <div className="mt-4">
              <ValueSparkline points={history} height={72} />
            </div>
          ) : null}
        </section>

        {isSelf && p.unpicked.length ? (
          <section className="rounded-2xl border border-lb-orange/25 bg-lb-orange/[0.07] p-4">
            <div className="text-[13px] font-semibold text-lb-orange">Pick your covers</div>
            <p className="text-xs text-ink-1 mt-1 leading-relaxed">
              {p.unpicked.length === 1 ? '1 comic has' : `${p.unpicked.length} comics have`} no cover picked, so {p.unpicked.length === 1 ? 'it’s' : 'they’re'} counted at cover
              price. Tap one and choose the cover you own — a variant or a later printing is worth something different from the 1st print.
            </p>
            <div className="flex gap-2 overflow-x-auto -mx-4 px-4 mt-3 pb-1">
              {p.unpicked.slice(0, 30).map((e) => (
                <button key={e.comicId} onClick={() => a.quickLog(e.meta)} className="w-[56px] flex-shrink-0 text-left">
                  <div className="aspect-[2/3] rounded overflow-hidden bg-bg-2">
                    <Cover src={e.meta.cover} alt={e.meta.title} className="w-full h-full" />
                  </div>
                  <div className="text-[9.5px] text-ink-1 mt-1 line-clamp-2 leading-tight">{e.meta.title}</div>
                </button>
              ))}
            </div>
          </section>
        ) : null}

        {counted ? (
          <section>
            <SectionHeader>How it's valued</SectionHeader>
            <div className="flex h-2.5 rounded-full overflow-hidden bg-bg-2">
              {(Object.keys(BASIS_UI) as (keyof typeof BASIS_UI)[]).map((k) =>
                p.basis[k] ? (
                  <div key={k} style={{ width: `${(p.basis[k] / counted) * 100}%`, background: BASIS_UI[k].color }} />
                ) : null,
              )}
            </div>
            <div className="grid grid-cols-2 gap-y-1.5 mt-3">
              {(Object.keys(BASIS_UI) as (keyof typeof BASIS_UI)[]).map((k) => (
                <div key={k} className="flex items-center gap-2 text-xs text-ink-1">
                  <span className="w-2 h-2 rounded-full" style={{ background: BASIS_UI[k].color }} />
                  {BASIS_UI[k].label}
                  <span className="text-ink-2">{p.basis[k]}</span>
                </div>
              ))}
            </div>
            {isSelf ? (
              <button
                onClick={() => void refreshValues(entries.filter((e) => e.owned), { force: true })}
                disabled={!!refresh}
                className="w-full mt-4 btn-secondary disabled:opacity-60"
              >
                {refresh ? `Checking prices… ${refresh.done}/${refresh.total}` : 'Update market values'}
              </button>
            ) : null}
          </section>
        ) : null}

        {p.byPublisher.length ? (
          <section>
            <SectionHeader>By publisher</SectionHeader>
            <div className="space-y-2.5">
              {p.byPublisher.slice(0, 8).map((x) => (
                <div key={x.publisher}>
                  <div className="flex justify-between text-xs mb-1">
                    <span className="text-ink-0 font-semibold truncate pr-2">{x.publisher}</span>
                    <span className="text-ink-2 flex-shrink-0">
                      {x.count} · <span className="text-ink-0 font-semibold">{fmtMoney(x.value, { compact: true })}</span>
                    </span>
                  </div>
                  <div className="h-2 rounded-full bg-bg-2 overflow-hidden">
                    <div
                      className="h-full rounded-full"
                      style={{ width: `${Math.max(2, (x.value / maxPub) * 100)}%`, background: 'linear-gradient(90deg, #00b52e, #19d94a)' }}
                    />
                  </div>
                </div>
              ))}
            </div>
          </section>
        ) : null}

        {p.top.length ? (
          <section>
            <SectionHeader>Most valuable</SectionHeader>
            <div className="space-y-1.5">
              {top.map((e, i) => {
                const v = valueOf(e);
                return (
                  <button
                    key={e.comicId}
                    onClick={() => a.openComic(e.meta)}
                    className="w-full flex items-center gap-3 p-2 rounded-xl active:bg-bg-1 text-left"
                  >
                    <span className="w-5 text-center text-xs font-bold text-ink-2">{i + 1}</span>
                    <div className="w-10 aspect-[2/3] rounded overflow-hidden bg-bg-2 flex-shrink-0">
                      <Cover src={e.meta.cover} alt={e.meta.title} className="w-full h-full" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-semibold truncate">{e.meta.title}</div>
                      <div className="text-[11px] text-ink-2 truncate">
                        {v.unpicked ? <span className="text-lb-orange">Cover not picked</span> : e.variants.length > 1 ? `${e.variants.length} covers` : e.variants[0]?.name}
                        {v.basis ? ` · ${BASIS_UI[v.basis].label}` : ''}
                      </div>
                    </div>
                    <div className="font-display text-[15px] font-extrabold text-lb-green">{fmtMoney(v.amount)}</div>
                  </button>
                );
              })}
            </div>
            {p.top.length > 10 && !showAll ? (
              <button onClick={() => setShowAll(true)} className="w-full mt-2 py-2 text-xs font-semibold text-ink-2">
                Show all {p.top.length}
              </button>
            ) : null}
          </section>
        ) : null}

        <p className="text-[11px] text-ink-2 leading-relaxed">
          Each comic is valued by the covers you picked: market estimates for raw (ungraded) copies of that exact cover from recent
          sales where available, otherwise its cover price. Set your own value or what you paid on any comic’s page.
        </p>
      </div>
    </Screen>
  );
}
