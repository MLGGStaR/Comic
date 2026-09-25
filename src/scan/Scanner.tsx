// Full-screen scanner. Barcode: live decode (UPC + 5-digit add-on / ISBN),
// optional "stack mode" that adds every scan to your collection. Cover: snap
// the front of the book → Claude reads it → exact issue + variant.
import { useCallback, useEffect, useRef, useState } from 'react';
import { api, type UpcMatch } from '../api/client';
import type { Barcode } from '../lib/barcode';
import { bestCode } from './readerOptions';
import { useBackLayer } from '../lib/backstack';
import { collection, useEntry } from '../state/collection';
import { useActions } from '../state/actions';
import type { ComicLite } from '../types';
import { Cover } from '../ui/Cover';
import { Icon } from '../ui/Icon';
import { StatusToggles } from '../ui/StatusToggles';
import { toast } from '../ui/toast';
import { fmtDate } from '../lib/format';
import { openRearCamera, stopStream, torchSupported, setTorch, grabFrame, guideToFrame, canvasToBase64, fileToJpegBase64 } from './camera';
import { decodeFrame, warmDecoder } from './decode';

type Mode = 'barcode' | 'cover';

interface Found {
  match: UpcMatch;
  via: 'barcode' | 'cover';
  code?: string;
  photo?: string; // data URL of the captured cover
  read?: { series?: string; issue?: string; publisher?: string; variant?: string };
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
          await collection.patch(match.comic, match.variantId ? { variants: variantList(match) } : { owned: true });
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

  const identifyPhoto = async (base64: string, dataUrl: string) => {
    setBusy('Reading the cover…');
    setMiss(null);
    try {
      const res = await api.scan(base64);
      if (!res.comic && !res.candidates.length) {
        setMiss('Couldn’t match that cover. Try again straight-on, with the title visible — or scan the barcode.');
        return;
      }
      setFound({ match: res, via: 'cover', photo: dataUrl, read: res.read });
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
    const b64 = canvasToBase64(canvas);
    await identifyPhoto(b64, `data:image/jpeg;base64,${b64}`);
  };

  const pickFile = async (f: File | undefined) => {
    if (!f) return;
    const b64 = await fileToJpegBase64(f);
    await identifyPhoto(b64, `data:image/jpeg;base64,${b64}`);
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

function variantList(match: UpcMatch) {
  const c = match.comic!;
  if (!match.variantId || match.variantId === c.id) return [{ id: c.id, name: 'Main cover', cover: c.cover }];
  const cur = collection.entry(c.id)?.variants ?? [];
  if (cur.some((v) => v.id === match.variantId)) return cur;
  const name = match.note ?? 'Variant cover';
  return [...cur, { id: match.variantId, name, cover: match.variantCover ?? null }];
}

function ResultSheet({ found, onAgain, onDone }: { found: Found; onAgain: () => void; onDone: () => void }) {
  const a = useActions();
  const [pick, setPick] = useState<ComicLite | null>(found.match.comic);
  const entry = useEntry(pick?.id);
  const alts = found.match.candidates.filter((c) => c.id !== pick?.id).slice(0, 8);
  const isVariant = pick && found.match.comic && pick.id === found.match.comic.id && found.match.variantId && found.match.variantId !== pick.id;

  return (
    <div className="absolute inset-x-0 bottom-0 rounded-t-3xl bg-bg-1 border-t border-white/10 p-5 sheet-up max-h-[78vh] overflow-y-auto" style={{ paddingBottom: 'max(1.5rem, env(safe-area-inset-bottom))' }}>
      <div className="mx-auto -mt-1 mb-4 h-1 w-9 rounded-full bg-white/20" />
      {pick ? (
        <>
          <div className="flex gap-4">
            <div className="w-24 aspect-[2/3] rounded-lg overflow-hidden bg-bg-2 flex-shrink-0 shadow-lg relative">
              <Cover src={isVariant ? found.match.variantCover ?? pick.cover : pick.cover} alt={pick.title} className="w-full h-full" eager />
            </div>
            <div className="min-w-0 flex-1">
              <div className="text-[10px] uppercase tracking-[0.16em] font-bold text-lb-green">
                {found.via === 'barcode' ? 'Barcode match' : 'Cover match'}
                {found.match.confidence != null && found.match.confidence < 0.7 ? <span className="text-amber-300"> · check it</span> : null}
              </div>
              <div className="font-display text-xl font-extrabold leading-tight mt-1">{pick.title}</div>
              <div className="text-xs text-ink-2 mt-1">{[pick.publisher, fmtDate(pick.releaseDate, { year: true })].filter(Boolean).join(' · ')}</div>
              {isVariant && found.match.note ? <div className="text-xs text-lb-orange mt-1">{found.match.note}</div> : null}
              {entry?.owned ? <div className="text-xs text-lb-green font-semibold mt-1.5">Already in your collection</div> : null}
            </div>
          </div>
          <div className="mt-4">
            {isVariant ? (
              <button
                onClick={() => {
                  if (!a.requireLogin()) return;
                  void collection.patch(pick, { variants: variantList(found.match) });
                  toast(`Logged ${found.match.note ?? 'variant'}`);
                }}
                className="w-full mb-2 py-2.5 rounded-xl bg-lb-green/15 text-lb-green text-sm font-bold"
              >
                I have this cover
              </button>
            ) : null}
            <StatusToggles comic={pick} />
          </div>
          <div className="grid grid-cols-2 gap-2 mt-3">
            <button onClick={onAgain} className="py-3 rounded-xl bg-bg-2 text-sm font-semibold">
              Scan another
            </button>
            <button
              onClick={() => {
                onDone();
                window.setTimeout(() => a.openComic(pick), 80);
              }}
              className="py-3 rounded-xl bg-bg-2 text-sm font-semibold text-lb-blue"
            >
              Open
            </button>
          </div>
        </>
      ) : (
        <div className="text-sm text-ink-1 mb-3">Which one is it?</div>
      )}
      {alts.length ? (
        <div className="mt-5">
          <div className="text-[10px] uppercase tracking-[0.14em] text-ink-2 font-semibold mb-2">{pick ? 'Not it? Close matches' : 'Close matches'}</div>
          <div className="flex gap-2 overflow-x-auto -mx-5 px-5 pb-1">
            {alts.map((c) => (
              <button key={c.id} onClick={() => setPick(c)} className="w-[72px] flex-shrink-0 text-left">
                <div className="aspect-[2/3] rounded-md overflow-hidden bg-bg-2">
                  <Cover src={c.cover} alt={c.title} className="w-full h-full" />
                </div>
                <div className="text-[10px] text-ink-1 mt-1 line-clamp-2 leading-tight">{c.title}</div>
              </button>
            ))}
          </div>
        </div>
      ) : null}
      {found.photo ? (
        <div className="mt-4 flex items-center gap-2 text-[11px] text-ink-2">
          <img src={found.photo} alt="" className="w-8 h-12 object-cover rounded" />
          Your photo{found.read?.series ? ` · read as “${[found.read.series, found.read.issue ? `#${found.read.issue}` : ''].join(' ').trim()}”` : ''}
        </div>
      ) : null}
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
