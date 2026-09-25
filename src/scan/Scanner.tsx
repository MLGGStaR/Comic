// Full-screen scanner. Barcode: live decode (UPC + 5-digit add-on / ISBN),
// optional "stack mode" that adds every scan to your collection. Cover: snap
// the front of the book → a barcode in the shot is read on the phone (exact,
// instant); otherwise Claude matches the photo against every cover of the
// issue → exact issue + cover, with the runner-ups one tap away.
import { useCallback, useEffect, useRef, useState } from 'react';
import { api, type ScanAlt, type UpcMatch } from '../api/client';
import type { Barcode } from '../lib/barcode';
import { bestCode } from './readerOptions';
import { useBackLayer } from '../lib/backstack';
import { collection, useEntry } from '../state/collection';
import { useActions } from '../state/actions';
import type { ComicLite, OwnedVariant } from '../types';
import { Cover } from '../ui/Cover';
import { Icon } from '../ui/Icon';
import { StatusToggles } from '../ui/StatusToggles';
import { AddCoverSheet } from '../ui/CoverPicker';
import { toast } from '../ui/toast';
import { fmtDate } from '../lib/format';
import { openRearCamera, stopStream, torchSupported, setTorch, grabFrame, guideToFrame, canvasToBase64, fileToJpegBase64 } from './camera';
import { decodeFrame, warmDecoder } from './decode';

type Mode = 'barcode' | 'cover';

interface Found {
  match: UpcMatch;
  via: 'barcode' | 'cover';
  code?: string;
  photo?: string; // jpeg base64 of the captured cover
  read?: { series?: string; issue?: string; publisher?: string; variant?: string };
}

/** A barcode (with its add-on / ISBN) in a still photo, read on the phone. */
async function codeInPhoto(b64: string): Promise<string | null> {
  try {
    const bmp = await createImageBitmap(await (await fetch(`data:image/jpeg;base64,${b64}`)).blob());
    const c = document.createElement('canvas');
    c.width = bmp.width;
    c.height = bmp.height;
    c.getContext('2d')!.drawImage(bmp, 0, 0);
    const bc = bestCode(await decodeFrame(c));
    if (!bc) return null;
    return bc.kind === 'upc' ? `${bc.upc}${bc.addon ?? ''}` : bc.isbn;
  } catch {
    return null;
  }
}

export function Scanner({ mode, onMode, onClose }: { mode: Mode; onMode: (m: Mode) => void; onClose: () => void }) {
  useBackLayer(onClose);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const guideRef = useRef<HTMLDivElement | null>(null);
  const fileRef = useRef<HTMLInputElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [camErr, setCamErr] = useState<string | null>(null);
  const [ready, setReady] = useState(false);
  const [torch, setTorchOn] = useState(false);
  const [canTorch, setCanTorch] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [found, setFound] = useState<Found | null>(null);
  const [miss, setMiss] = useState<string | null>(null);
  const [stack, setStack] = useState(false);
  const [added, setAdded] = useState(0);
  const pausedRef = useRef(false);
  const lastCodeRef = useRef<{ code: string; t: number } | null>(null);

  // camera lifecycle
  useEffect(() => {
    let alive = true;
    const v = videoRef.current;
    if (!v) return;
    openRearCamera(v)
      .then((s) => {
        if (!alive) return stopStream(s);
        streamRef.current = s;
        setCanTorch(torchSupported(s));
        setReady(true);
      })
      .catch((e: Error) => {
        setCamErr(
          e.name === 'NotAllowedError'
            ? 'Camera access is off. Allow it in your browser settings, or pick a photo instead.'
            : e.message || 'Camera unavailable',
        );
      });
    void warmDecoder();
    return () => {
      alive = false;
      stopStream(streamRef.current);
      streamRef.current = null;
    };
  }, []);

  const resolveCode = useCallback(
    async (bc: Barcode, raw: string) => {
      setBusy('Looking it up…');
      setMiss(null);
      try {
        const code = bc.kind === 'upc' ? `${bc.upc}${bc.addon ?? ''}` : bc.isbn;
        const match = await api.upc(code);
        if (!match.comic && !match.candidates.length) {
          setMiss(
            bc.kind === 'upc' && !bc.addon
              ? 'Got the barcode but not the small 5-digit code beside it — try again a bit closer.'
              : 'No comic matches this barcode yet. Try scanning the cover instead.',
          );
          pausedRef.current = false;
          return;
        }
        if (stack && match.comic) {
          // a barcode names the exact cover: log that one
          await collection.patch(match.comic, { variants: variantList(match) });
          setAdded((n) => n + 1);
          toast(`Added ${match.comic.title}`);
          window.setTimeout(() => (pausedRef.current = false), 1200);
          return;
        }
        setFound({ match, via: 'barcode', code: raw });
      } catch (e) {
        setMiss((e as Error).message);
        pausedRef.current = false;
      } finally {
        setBusy(null);
      }
    },
    [stack],
  );

  // barcode decode loop
  useEffect(() => {
    if (mode !== 'barcode' || !ready || found) return;
    let stop = false;
    let n = 0;
    pausedRef.current = false;
    const tick = async () => {
      while (!stop) {
        await new Promise((r) => setTimeout(r, 140));
        if (stop || pausedRef.current) continue;
        const v = videoRef.current;
        const g = guideRef.current;
        if (!v || !g || !v.videoWidth) continue;
        // alternate: the guide box (sharp, close up) and the whole frame (in
        // case the barcode or its add-on sits outside the guide)
        const region = n++ % 2 === 0 ? guideToFrame(v, g.getBoundingClientRect()) : { x: 0, y: 0, w: 1, h: 1 };
        const canvas = grabFrame(v, region, 1600);
        const texts = await decodeFrame(canvas).catch(() => [] as string[]);
        const bc = bestCode(texts);
        if (!bc) continue;
        // an issue's number lives in the 5-digit add-on: give the reader a
        // moment to catch it before settling for the main code alone
        if (bc.kind === 'upc' && !bc.addon) {
          const last = lastCodeRef.current;
          if (!last || last.code !== bc.upc) {
            lastCodeRef.current = { code: bc.upc, t: Date.now() };
            continue;
          }
          if (Date.now() - last.t < 1800) continue;
        }
        const key = bc.kind === 'upc' ? `${bc.upc}${bc.addon ?? ''}` : bc.isbn;
        if (stack && lastCodeRef.current?.code === `done:${key}` && Date.now() - lastCodeRef.current.t < 4000) continue;
        lastCodeRef.current = { code: `done:${key}`, t: Date.now() };
        pausedRef.current = true;
        navigator.vibrate?.(30);
        void resolveCode(bc, texts.join(' | '));
      }
    };
    void tick();
    return () => {
      stop = true;
    };
  }, [mode, ready, found, stack, resolveCode]);

  const identifyPhoto = async (base64: string) => {
    setBusy('Reading the cover…');
    setMiss(null);
    try {
      // the barcode printed on the cover names the exact issue and cover
      const code = await codeInPhoto(base64);
      if (code) {
        const hit = await api.upc(code).catch(() => null);
        if (hit?.comic) {
          navigator.vibrate?.(30);
          setFound({ match: { ...hit, matched: true }, via: 'barcode', code, photo: base64 });
          return;
        }
      }
      setBusy('Matching the cover…');
      const res = await api.scan(base64, code);
      if (!res.comic && !res.candidates.length) {
        setMiss(res.note && res.note !== 'Couldn’t match this cover' ? res.note : 'Couldn’t match that cover. Try again straight-on with the title visible, or scan the barcode.');
        return;
      }
      setFound({ match: res, via: res.via ?? 'cover', photo: base64, read: res.read });
    } catch (e) {
      setMiss((e as Error).message);
    } finally {
      setBusy(null);
    }
  };

  const shoot = async () => {
    const v = videoRef.current;
    const g = guideRef.current;
    if (!v || !g || !v.videoWidth) return;
    navigator.vibrate?.(15);
    const canvas = grabFrame(v, guideToFrame(v, g.getBoundingClientRect()), 1280);
    await identifyPhoto(canvasToBase64(canvas));
  };

  const pickFile = async (f: File | undefined) => {
    if (!f) return;
    await identifyPhoto(await fileToJpegBase64(f));
  };

  const again = () => {
    setFound(null);
    setMiss(null);
    lastCodeRef.current = null;
    pausedRef.current = false;
  };

  return (
    <div className="fixed inset-0 z-50 bg-black text-ink-0 select-none" data-nopull>
      <video ref={videoRef} className="absolute inset-0 w-full h-full object-cover" playsInline muted />

      {/* guide + dimmed surround */}
      <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
        <div
          ref={guideRef}
          className={`relative rounded-2xl transition-all duration-300 ${
            mode === 'barcode' ? 'w-[78%] h-[22%] max-w-[420px]' : 'w-[68%] aspect-[2/3] max-w-[360px]'
          }`}
          style={{ boxShadow: '0 0 0 9999px rgba(0,0,0,0.55)' }}
        >
          <Corners tone={mode === 'barcode' ? '#40bcf4' : '#00d735'} />
          {mode === 'barcode' && ready && !found && !busy ? <div className="absolute inset-x-4 top-1/2 h-0.5 bg-lb-blue/80 shadow-[0_0_12px_#40bcf4] animate-pulse" /> : null}
        </div>
      </div>

      {/* top bar */}
      <div className="absolute inset-x-0 top-0 flex items-center justify-between px-3" style={{ paddingTop: 'max(0.75rem, env(safe-area-inset-top))' }}>
        <button onClick={onClose} aria-label="Close scanner" className="w-10 h-10 rounded-full bg-black/50 backdrop-blur flex items-center justify-center">
          <Icon name="close" size={20} />
        </button>
        <div className="flex bg-black/50 backdrop-blur rounded-full p-1">
          {(['cover', 'barcode'] as Mode[]).map((m) => (
            <button
              key={m}
              onClick={() => {
                again();
                onMode(m);
              }}
              className={`px-4 py-1.5 rounded-full text-[13px] font-semibold ${mode === m ? 'bg-white text-black' : 'text-ink-1'}`}
            >
              {m === 'cover' ? 'Cover' : 'Barcode'}
            </button>
          ))}
        </div>
        <button
          onClick={() => {
            const next = !torch;
            setTorchOn(next);
            void setTorch(streamRef.current, next);
          }}
          disabled={!canTorch}
          aria-label="Flashlight"
          className={`w-10 h-10 rounded-full backdrop-blur flex items-center justify-center disabled:opacity-0 ${torch ? 'bg-amber-300 text-black' : 'bg-black/50'}`}
        >
          <Icon name="flash" size={18} />
        </button>
      </div>

      {/* hint / status */}
      {!found ? (
        <div className="absolute inset-x-0 text-center px-8" style={{ top: mode === 'barcode' ? '26%' : '12%' }}>
          <div className="inline-block px-3 py-1.5 rounded-full bg-black/55 backdrop-blur text-[13px] font-semibold">
            {camErr
              ? 'Camera unavailable'
              : busy ?? (mode === 'barcode' ? 'Line up the barcode — include the small code to its right' : 'Fit the whole cover in the frame')}
          </div>
        </div>
      ) : null}

      {camErr ? (
        <div className="absolute inset-x-6 top-1/2 -translate-y-1/2 text-center">
          <p className="text-sm text-ink-1 mb-4">{camErr}</p>
          <button onClick={() => fileRef.current?.click()} className="btn-primary">
            Pick a photo
          </button>
        </div>
      ) : null}

      {miss && !found ? (
        <div className="absolute inset-x-4 bottom-[150px] rounded-2xl bg-bg-1/95 backdrop-blur border border-white/10 p-4 text-sm text-ink-1 fade-in" style={{ marginBottom: 'env(safe-area-inset-bottom)' }}>
          {miss}
          <button onClick={again} className="block mt-3 text-lb-green font-semibold text-sm">
            Try again
          </button>
        </div>
      ) : null}

      {/* bottom controls */}
      {!found ? (
        <div className="absolute inset-x-0 bottom-0 pb-8 px-6 flex items-center justify-between" style={{ paddingBottom: 'max(2rem, env(safe-area-inset-bottom))' }}>
          <button onClick={() => fileRef.current?.click()} aria-label="Pick a photo" className="w-12 h-12 rounded-2xl bg-black/50 backdrop-blur flex items-center justify-center">
            <Icon name="layers" size={22} />
          </button>
          {mode === 'cover' ? (
            <button
              onClick={() => void shoot()}
              disabled={!ready || !!busy}
              aria-label="Take photo"
              className="w-[74px] h-[74px] rounded-full border-4 border-white/90 flex items-center justify-center disabled:opacity-40"
            >
              <span className={`w-[58px] h-[58px] rounded-full ${busy ? 'bg-lb-green animate-pulse' : 'bg-white'}`} />
            </button>
          ) : (
            <button
              onClick={() => {
                setStack((s) => !s);
                setAdded(0);
              }}
              className={`px-4 h-12 rounded-full text-[13px] font-bold backdrop-blur ${stack ? 'bg-lb-green text-bg-0' : 'bg-black/50 text-ink-0'}`}
            >
              {stack ? `Stack mode · ${added} added` : 'Stack mode'}
            </button>
          )}
          <div className="w-12" />
        </div>
      ) : null}

      <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={(e) => void pickFile(e.target.files?.[0])} />

      {found ? <ResultSheet found={found} onAgain={again} onDone={onClose} /> : null}
    </div>
  );
}

/** The exact cover a match names, as a collection entry would log it. */
function coverOf(match: { comic: ComicLite | null; variantId?: string | null; variantCover?: string | null; note?: string | null }): OwnedVariant | null {
  const c = match.comic;
  if (!c) return null;
  if (!match.variantId || match.variantId === c.id) return { id: c.id, name: 'Main cover', cover: c.cover, price: c.price };
  return { id: match.variantId, name: match.note ?? 'Variant cover', cover: match.variantCover ?? null };
}

/** Your covers of this comic plus the one just scanned (nothing you logged is dropped). */
function variantList(match: UpcMatch): OwnedVariant[] {
  const v = coverOf(match)!;
  const cur = collection.entry(match.comic!.id)?.variants ?? [];
  return cur.some((x) => x.id === v.id) ? cur : [...cur, v];
}

interface Pick {
  comic: ComicLite;
  variantId: string | null;
  variantCover: string | null;
  note: string | null;
}

function ResultSheet({ found, onAgain, onDone }: { found: Found; onAgain: () => void; onDone: () => void }) {
  const a = useActions();
  const m = found.match;
  const first: Pick | null = m.comic ? { comic: m.comic, variantId: m.variantId ?? null, variantCover: m.variantCover ?? null, note: m.note ?? null } : null;
  const [pick, setPick] = useState<Pick | null>(first);
  const [adding, setAdding] = useState(false);
  const entry = useEntry(pick?.comic.id);
  const cover = pick ? coverOf(pick) : null;
  const isVariant = !!pick?.variantId && pick.variantId !== pick.comic.id;
  const notListed = found.via === 'cover' && m.matched === false && !(m.alternatives ?? []).length && !!m.comic;
  const unsure = found.via === 'cover' && m.matched === false && !notListed;
  const haveIt = !!cover && !!entry?.variants.some((v) => v.id === cover.id);

  // every cover the scanner weighed (the pick included), then other issues
  const covers: Pick[] = first ? [first, ...(m.alternatives ?? []).map((x: ScanAlt) => ({ ...x }))] : [];
  const issues = m.candidates.filter((c) => c.id !== pick?.comic.id).slice(0, 8);
  const same = (x: Pick) => !!pick && x.comic.id === pick.comic.id && (x.variantId ?? null) === (pick.variantId ?? null);

  return (
    <div className="absolute inset-x-0 bottom-0 rounded-t-3xl bg-bg-1 border-t border-white/10 p-5 sheet-up max-h-[80vh] overflow-y-auto" style={{ paddingBottom: 'max(1.5rem, env(safe-area-inset-bottom))' }}>
      <div className="mx-auto -mt-1 mb-4 h-1 w-9 rounded-full bg-white/20" />
      {pick ? (
        <>
          <div className="flex gap-4">
            <div className="w-24 aspect-[2/3] rounded-lg overflow-hidden bg-bg-2 flex-shrink-0 shadow-lg relative">
              <Cover src={pick.variantCover ?? pick.comic.cover} alt={pick.comic.title} className="w-full h-full" eager />
            </div>
            <div className="min-w-0 flex-1">
              <div className={`text-[10px] uppercase tracking-[0.16em] font-bold ${unsure || notListed ? 'text-amber-300' : 'text-lb-green'}`}>
                {found.via === 'barcode' ? 'Barcode match' : notListed ? 'Issue found · cover not listed' : unsure ? 'Best guess · check the cover' : 'Cover match'}
              </div>
              <div className="font-display text-xl font-extrabold leading-tight mt-1">{pick.comic.title}</div>
              <div className="text-xs text-ink-2 mt-1">{[pick.comic.publisher, fmtDate(pick.comic.releaseDate, { year: true })].filter(Boolean).join(' · ')}</div>
              <div className={`text-xs mt-1 ${isVariant ? 'text-lb-orange' : 'text-ink-1'}`}>{isVariant ? pick.note ?? 'Variant cover' : 'Main cover'}</div>
              {haveIt ? <div className="text-xs text-lb-green font-semibold mt-1.5">This cover is in your collection</div> : entry?.owned ? <div className="text-xs text-ink-2 mt-1.5">You have another cover of this</div> : null}
            </div>
          </div>

          {covers.length > 1 ? (
            <div className="mt-4">
              <div className="text-[10px] uppercase tracking-[0.14em] text-ink-2 font-semibold mb-2">{unsure ? 'Which one is yours?' : 'Or one of these covers'}</div>
              <div className="flex gap-2 overflow-x-auto -mx-5 px-5 pb-1">
                {covers.map((x) => (
                  <button key={`${x.comic.id}:${x.variantId ?? ''}`} onClick={() => setPick(x)} className="w-[68px] flex-shrink-0 text-left">
                    <div className={`aspect-[2/3] rounded-md overflow-hidden bg-bg-2 ${same(x) ? 'ring-2 ring-lb-green' : 'opacity-80'}`}>
                      <Cover src={x.variantCover ?? x.comic.cover} alt={x.note ?? x.comic.title} className="w-full h-full" />
                    </div>
                    <div className="text-[9.5px] text-ink-1 mt-1 line-clamp-2 leading-tight">
                      {x.comic.id !== first?.comic.id ? `${x.comic.title} · ` : ''}
                      {x.variantId ? x.note ?? 'Variant' : 'Main cover'}
                    </div>
                  </button>
                ))}
              </div>
            </div>
          ) : null}

          <div className="mt-4">
            <StatusToggles comic={pick.comic} haveCover={cover} />
            {entry?.owned && !haveIt && cover ? (
              <button
                onClick={() => {
                  if (!a.requireLogin()) return;
                  void collection.patch(pick.comic, { variants: variantList({ ...m, comic: pick.comic, variantId: pick.variantId, variantCover: pick.variantCover, note: pick.note }) });
                  toast(`Logged ${cover.name}`);
                }}
                className="w-full mt-2 py-2.5 rounded-xl bg-lb-green/15 text-lb-green text-sm font-bold"
              >
                I have this cover too
              </button>
            ) : null}
          </div>

          {found.photo && found.via === 'cover' ? (
            <button onClick={() => (a.requireLogin() ? setAdding(true) : undefined)} className="w-full mt-2 py-2.5 rounded-xl bg-bg-2 text-[13px] font-semibold text-ink-1 flex items-center justify-center gap-2">
              <Icon name="camera" size={16} />
              {notListed ? 'Add my photo as this cover' : 'Mine isn’t listed — add my photo'}
            </button>
          ) : null}

          <div className="grid grid-cols-2 gap-2 mt-3">
            <button onClick={onAgain} className="py-3 rounded-xl bg-bg-2 text-sm font-semibold">
              Scan another
            </button>
            <button
              onClick={() => {
                onDone();
                window.setTimeout(() => a.openComic(pick.comic), 80);
              }}
              className="py-3 rounded-xl bg-bg-2 text-sm font-semibold text-lb-blue"
            >
              Open
            </button>
          </div>
        </>
      ) : (
        <div className="text-sm text-ink-1 mb-3">{m.note ?? 'Which one is it?'}</div>
      )}
      {issues.length ? (
        <div className="mt-5">
          <div className="text-[10px] uppercase tracking-[0.14em] text-ink-2 font-semibold mb-2">{pick ? 'Other issues it could be' : 'Close matches'}</div>
          <div className="flex gap-2 overflow-x-auto -mx-5 px-5 pb-1">
            {issues.map((c) => (
              <button key={c.id} onClick={() => setPick({ comic: c, variantId: null, variantCover: null, note: null })} className="w-[68px] flex-shrink-0 text-left">
                <div className="aspect-[2/3] rounded-md overflow-hidden bg-bg-2">
                  <Cover src={c.cover} alt={c.title} className="w-full h-full" />
                </div>
                <div className="text-[9.5px] text-ink-1 mt-1 line-clamp-2 leading-tight">{c.title}</div>
              </button>
            ))}
          </div>
        </div>
      ) : null}
      {found.photo ? (
        <div className="mt-4 flex items-center gap-2 text-[11px] text-ink-2">
          <img src={`data:image/jpeg;base64,${found.photo}`} alt="" className="w-8 h-12 object-cover rounded" />
          Your photo{found.read?.series ? ` · read as “${[found.read.series, found.read.issue ? `#${found.read.issue}` : ''].join(' ').trim()}”` : ''}
        </div>
      ) : null}
      {adding && pick ? <AddCoverSheet comic={pick.comic} photo={found.photo} suggestedName={found.read?.variant ?? null} onClose={() => setAdding(false)} /> : null}
    </div>
  );
}

function Corners({ tone }: { tone: string }) {
  const s = { borderColor: tone };
  const c = 'absolute w-7 h-7 border-[3px]';
  return (
    <>
      <span className={`${c} -top-0.5 -left-0.5 border-r-0 border-b-0 rounded-tl-2xl`} style={s} />
      <span className={`${c} -top-0.5 -right-0.5 border-l-0 border-b-0 rounded-tr-2xl`} style={s} />
      <span className={`${c} -bottom-0.5 -left-0.5 border-r-0 border-t-0 rounded-bl-2xl`} style={s} />
      <span className={`${c} -bottom-0.5 -right-0.5 border-l-0 border-t-0 rounded-br-2xl`} style={s} />
    </>
  );
}
