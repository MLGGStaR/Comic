// Average color of a cover (tiny canvas sample, skipping near-black/gray
// pixels), muted for use as Home's ambient glow. Needs a CORS-enabled image;
// if the host doesn't allow it, the canvas is tainted and we skip the tint.
import { useEffect, useState } from 'react';

export function useCoverTint(src: string | null | undefined): string | null {
  const [tint, setTint] = useState<string | null>(null);
  useEffect(() => {
    if (!src) return;
    let alive = true;
    const im = new Image();
    im.crossOrigin = 'anonymous';
    im.onload = () => {
      try {
        const c = document.createElement('canvas');
        c.width = 12;
        c.height = 18;
        const ctx = c.getContext('2d')!;
        ctx.drawImage(im, 0, 0, 12, 18);
        const d = ctx.getImageData(0, 0, 12, 18).data;
        let r = 0;
        let g = 0;
        let b = 0;
        let n = 0;
        for (let i = 0; i < d.length; i += 4) {
          const mx = Math.max(d[i], d[i + 1], d[i + 2]);
          const mn = Math.min(d[i], d[i + 1], d[i + 2]);
          if (mx < 40 || mx - mn < 25) continue;
          r += d[i];
          g += d[i + 1];
          b += d[i + 2];
          n++;
        }
        if (!n || !alive) return;
        setTint(`rgba(${Math.round(r / n)}, ${Math.round(g / n)}, ${Math.round(b / n)}, 0.42)`);
      } catch {
        // tainted canvas — no tint
      }
    };
    im.src = `${src}${src.includes('?') ? '&' : '?'}tint=1`;
    return () => {
      alive = false;
    };
  }, [src]);
  return tint;
}
