import { useState } from 'react';

// Covers fade in instead of popping, retry once on a flaky network, and fall
// back to a titled placeholder so a grid never shows broken-image icons.
export function Cover({
  src,
  alt,
  className,
  eager,
}: {
  src?: string | null;
  alt: string;
  className?: string;
  eager?: boolean;
}) {
  const [attempt, setAttempt] = useState(0);
  const [loaded, setLoaded] = useState(false);
  if (!src || attempt >= 2) {
    return (
      <div
        className={`flex items-center justify-center bg-bg-2 text-ink-2 text-[10px] leading-tight text-center px-1.5 ${
          className ?? ''
        }`}
      >
        <span className="line-clamp-4">{alt}</span>
      </div>
    );
  }
  const url = attempt === 1 ? `${src}${src.includes('?') ? '&' : '?'}r=1` : src;
  return (
    <img
      src={url}
      alt={alt}
      loading={eager ? 'eager' : 'lazy'}
      decoding="async"
      draggable={false}
      referrerPolicy="no-referrer"
      onError={() => setAttempt((a) => a + 1)}
      onLoad={() => setLoaded(true)}
      className={`object-cover bg-bg-2 transition-opacity duration-200 ${loaded ? 'opacity-100' : 'opacity-0'} ${
        className ?? ''
      }`}
    />
  );
}
