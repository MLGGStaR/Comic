// "Which cover do you have?" — owning a comic says nothing about WHICH copy
// (1st print, a variant, a later printing, a store exclusive), and that is what
// decides its value. The strip lists every cover; tap yours. Covers the
// catalogue lacks can be added from a photo.
import { useEffect, useRef, useState } from 'react';
import { api } from '../api/client';
import { addCustomCover } from '../api/covers';
import { collection, useEntry } from '../state/collection';
import { autoPickOnlyCover } from '../state/values';
import type { ComicDetail, ComicLite, Variant } from '../types';
import { Cover } from './Cover';
import { Icon } from './Icon';
import { Sheet } from './Sheet';
import { toast } from './toast';
import { fileToJpegBase64 } from '../scan/camera';

// ── covers of one comic changed (a photo added or removed) ──
const changed = new Set<(comicId: string) => void>();
export const coversChanged = {
  on(fn: (comicId: string) => void) {
    changed.add(fn);
    return () => void changed.delete(fn);
  },
  emit(comicId: string) {
    changed.forEach((fn) => fn(comicId));
  },
};

/** Main cover first, then the catalogue's variants and collector photos. */
export function allCovers(comic: ComicLite, detail: ComicDetail | null): Variant[] {
  const main: Variant = { id: comic.id, name: 'Main cover', cover: detail?.cover ?? comic.cover, price: detail?.price ?? comic.price };
  return [main, ...(detail?.variants ?? [])];
}

/** Log / un-log one cover. Removing the last one keeps the comic owned, cover unknown. */
export function toggleOwnedCover(comic: ComicLite, v: Variant): boolean {
  const cur = collection.entry(comic.id)?.variants ?? [];
  const has = cur.some((x) => x.id === v.id);
  const next = has ? cur.filter((x) => x.id !== v.id) : [...cur, { id: v.id, name: v.name, cover: v.cover, price: v.price ?? null }];
  void collection.patch(comic, { variants: next, owned: true });
  return !has;
}

/** The comic's detail: the one given, else fetched (cached) — refreshed when its covers change. */
function useDetail(comic: ComicLite, given?: ComicDetail | null) {
  const [loaded, setLoaded] = useState<ComicDetail | null>(null);
  const [nonce, setNonce] = useState(0);
  useEffect(() => coversChanged.on((id) => id === comic.id && setNonce((n) => n + 1)), [comic.id]);
  useEffect(() => {
    if (given) return;
    let alive = true;
    api
      .comic(comic)
      .then((d) => alive && setLoaded(d))
      .catch(() => {});
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [comic.id, given, nonce]);
  return given ?? loaded;
}

export function CoverPicker({ comic, detail: given, className = '' }: { comic: ComicLite; detail?: ComicDetail | null; className?: string }) {
  const entry = useEntry(comic.id);
  const detail = useDetail(comic, given);
  const [adding, setAdding] = useState(false);

  // one cover only: nothing to choose
  useEffect(() => {
    if (entry?.owned && !entry.variants.length && detail) void autoPickOnlyCover(entry, detail);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [entry?.owned, entry?.variants.length, detail]);

  if (!entry?.owned) return null;
  const covers = detail ? allCovers(comic, detail) : null;
  const owned = new Set(entry.variants.map((v) => v.id));
  const unpicked = owned.size === 0;
  if (covers && covers.length === 1 && !unpicked) return null;

  return (
    <div className={`rounded-2xl p-3 ${unpicked ? 'bg-lb-orange/[0.08] border border-lb-orange/25' : 'bg-bg-0/40'} ${className}`} data-nodrag>
      <div className="flex items-baseline justify-between mb-2 gap-2">
        <div className={`text-[13px] font-semibold ${unpicked ? 'text-lb-orange' : 'text-ink-1'}`}>
          {unpicked ? 'Which cover do you have?' : owned.size > 1 ? `Your covers · ${owned.size}` : 'Your cover'}
        </div>
        <div className="text-[10px] text-ink-2 text-right">{unpicked ? 'it decides the value' : 'tap to change'}</div>
      </div>
      <div className="flex gap-2 overflow-x-auto -mx-3 px-3 pb-1">
        {covers
          ? covers.map((v) => {
              const on = owned.has(v.id);
              return (
                <button
                  key={v.id}
                  onClick={() => {
                    navigator.vibrate?.(8);
                    toggleOwnedCover(comic, v);
                  }}
                  aria-pressed={on}
                  className="w-[64px] flex-shrink-0 text-left"
                >
                  <div className={`relative aspect-[2/3] rounded-md overflow-hidden bg-bg-2 ${on ? 'ring-2 ring-lb-green' : 'opacity-80'}`}>
                    <Cover src={v.cover} alt={v.name} className="w-full h-full" />
                    {on ? (
                      <span className="absolute bottom-1 right-1 w-5 h-5 rounded-full bg-lb-green text-bg-0 flex items-center justify-center">
                        <Icon name="check" size={12} strokeWidth={3.2} />
                      </span>
                    ) : null}
                    {v.custom ? <span className="absolute top-0.5 left-0.5 rounded bg-black/70 px-1 text-[8px] font-bold text-ink-0">PHOTO</span> : null}
                  </div>
                  <div className={`text-[9.5px] mt-1 leading-tight line-clamp-2 ${on ? 'text-lb-green font-semibold' : 'text-ink-2'}`}>{shortName(v.name)}</div>
                </button>
              );
            })
          : Array.from({ length: 4 }).map((_, i) => <div key={i} className="w-[64px] flex-shrink-0 aspect-[2/3] rounded-md skeleton" />)}
        <button onClick={() => setAdding(true)} className="w-[64px] flex-shrink-0 text-left">
          <div className="aspect-[2/3] rounded-md border border-dashed border-white/25 flex flex-col items-center justify-center gap-1 text-ink-2">
            <Icon name="camera" size={18} />
            <span className="text-[9px] font-semibold">Not here?</span>
          </div>
          <div className="text-[9.5px] mt-1 leading-tight text-ink-2">Add yours</div>
        </button>
      </div>
      {adding ? <AddCoverSheet comic={comic} onClose={() => setAdding(false)} /> : null}
    </div>
  );
}

/** "Cover C Jim Lee Variant" → "C · Jim Lee"; long store names stay readable. */
function shortName(n: string): string {
  if (n === 'Main cover') return 'Main';
  const m = n.match(/^Cover ([A-Z]{1,2})\s+(.*?)(?:\s+(?:Card Stock\s+)?Variant)?$/i);
  if (m) return `${m[1]} · ${m[2]}`;
  return n.replace(/\s+Variant$/i, '');
}

/** Add a cover the catalogue doesn't list, from a photo (and log it as yours). */
export function AddCoverSheet({
  comic,
  photo,
  suggestedName,
  onClose,
}: {
  comic: ComicLite;
  photo?: string | null; // jpeg base64 (e.g. the scanner's shot)
  suggestedName?: string | null;
  onClose: () => void;
}) {
  const [b64, setB64] = useState<string | null>(photo ?? null);
  const [name, setName] = useState(suggestedName ?? '');
  const [busy, setBusy] = useState(false);
  const fileRef = useRef<HTMLInputElement | null>(null);

  const pick = async (f: File | undefined) => {
    if (!f) return;
    try {
      setB64(await fileToJpegBase64(f, 1200));
    } catch {
      toast('Couldn’t open that photo', 'error');
    }
  };

  const save = async () => {
    if (!b64 || busy) return;
    setBusy(true);
    try {
      const v = await addCustomCover(comic, b64, name);
      const cur = collection.entry(comic.id)?.variants ?? [];
      await collection.patch(comic, { variants: [...cur, { id: v.id, name: v.name, cover: v.cover, price: v.price ?? null }] });
      coversChanged.emit(comic.id);
      toast('Cover added — logged as yours, and scans will recognise it');
      onClose();
    } catch (e) {
      toast((e as Error).message, 'error');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Sheet onClose={onClose} label="Add a cover">
      <div className="text-[16px] font-semibold">Add your cover</div>
      <p className="text-xs text-ink-2 mt-1 leading-relaxed">
        For covers the catalogue doesn’t list — store exclusives like FOMO Books. It’s added to <b className="text-ink-1">{comic.title}</b> for everyone, and
        cover scans will recognise it.
      </p>
      <div className="flex gap-4 mt-4">
        <button
          onClick={() => fileRef.current?.click()}
          className="w-28 aspect-[2/3] rounded-lg bg-bg-2 overflow-hidden flex items-center justify-center border border-dashed border-white/20 flex-shrink-0"
        >
          {b64 ? (
            <img src={`data:image/jpeg;base64,${b64}`} alt="" className="w-full h-full object-cover" />
          ) : (
            <div className="flex flex-col items-center gap-1 text-xs text-ink-2">
              <Icon name="camera" size={22} />
              Photo
            </div>
          )}
        </button>
        <div className="flex-1 min-w-0">
          <label className="block text-[11px] text-ink-2">
            Cover name
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="FOMO Books exclusive"
              className="mt-1 w-full bg-bg-2 rounded-lg px-3 py-2 text-[16px] text-ink-0 focus:outline-none"
            />
          </label>
          <div className="text-[11px] text-ink-2 mt-2 leading-snug">Shoot it straight on with the whole cover in the frame.</div>
          {b64 ? (
            <button onClick={() => fileRef.current?.click()} className="text-[12px] font-semibold text-lb-blue mt-2">
              Retake
            </button>
          ) : null}
        </div>
      </div>
      <button disabled={!b64 || busy} onClick={() => void save()} className="w-full mt-4 btn-primary disabled:opacity-50">
        {busy ? 'Adding…' : 'Add cover'}
      </button>
      <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={(e) => void pick(e.target.files?.[0])} />
    </Sheet>
  );
}
