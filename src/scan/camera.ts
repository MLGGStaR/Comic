// Rear camera helpers shared by the cover and barcode scanners.

export async function openRearCamera(video: HTMLVideoElement): Promise<MediaStream> {
  if (!navigator.mediaDevices?.getUserMedia) throw new Error('This browser can’t open the camera');
  const stream = await navigator.mediaDevices.getUserMedia({
    audio: false,
    video: {
      facingMode: { ideal: 'environment' },
      width: { ideal: 1920 },
      height: { ideal: 1080 },
    },
  });
  video.srcObject = stream;
  video.setAttribute('playsinline', 'true');
  video.muted = true;
  await video.play().catch(() => {});
  // continuous autofocus where supported (Android Chrome)
  const track = stream.getVideoTracks()[0];
  try {
    const caps = track.getCapabilities?.() as MediaTrackCapabilities & { focusMode?: string[] };
    if (caps?.focusMode?.includes('continuous')) {
      await track.applyConstraints({ advanced: [{ focusMode: 'continuous' } as MediaTrackConstraintSet] });
    }
  } catch {
    // not supported
  }
  return stream;
}

export function stopStream(stream: MediaStream | null) {
  stream?.getTracks().forEach((t) => t.stop());
}

export function torchSupported(stream: MediaStream | null): boolean {
  const track = stream?.getVideoTracks()[0];
  const caps = track?.getCapabilities?.() as (MediaTrackCapabilities & { torch?: boolean }) | undefined;
  return !!caps?.torch;
}

export async function setTorch(stream: MediaStream | null, on: boolean) {
  const track = stream?.getVideoTracks()[0];
  if (!track) return;
  await track.applyConstraints({ advanced: [{ torch: on } as MediaTrackConstraintSet] }).catch(() => {});
}

/** Crop a region of the live frame (fractions of the frame) into a canvas. */
export function grabFrame(
  video: HTMLVideoElement,
  region: { x: number; y: number; w: number; h: number },
  maxSide: number,
): HTMLCanvasElement {
  const vw = video.videoWidth;
  const vh = video.videoHeight;
  const sx = Math.round(region.x * vw);
  const sy = Math.round(region.y * vh);
  const sw = Math.round(region.w * vw);
  const sh = Math.round(region.h * vh);
  const scale = Math.min(1, maxSide / Math.max(sw, sh));
  const c = document.createElement('canvas');
  c.width = Math.round(sw * scale);
  c.height = Math.round(sh * scale);
  c.getContext('2d')!.drawImage(video, sx, sy, sw, sh, 0, 0, c.width, c.height);
  return c;
}

/**
 * Map the on-screen guide box to fractions of the camera frame, accounting
 * for object-fit: cover cropping of the <video>.
 */
export function guideToFrame(video: HTMLVideoElement, guide: DOMRect) {
  const vr = video.getBoundingClientRect();
  const vw = video.videoWidth || 1;
  const vh = video.videoHeight || 1;
  const scale = Math.max(vr.width / vw, vr.height / vh);
  const dispW = vw * scale;
  const dispH = vh * scale;
  const offX = (dispW - vr.width) / 2;
  const offY = (dispH - vr.height) / 2;
  const x = (guide.left - vr.left + offX) / dispW;
  const y = (guide.top - vr.top + offY) / dispH;
  const clamp = (n: number) => Math.min(1, Math.max(0, n));
  return {
    x: clamp(x),
    y: clamp(y),
    w: clamp(guide.width / dispW),
    h: clamp(guide.height / dispH),
  };
}

export async function fileToJpegBase64(file: Blob, maxSide = 1280): Promise<string> {
  const bmp = await createImageBitmap(file);
  const scale = Math.min(1, maxSide / Math.max(bmp.width, bmp.height));
  const c = document.createElement('canvas');
  c.width = Math.round(bmp.width * scale);
  c.height = Math.round(bmp.height * scale);
  c.getContext('2d')!.drawImage(bmp, 0, 0, c.width, c.height);
  return canvasToBase64(c);
}

export function canvasToBase64(c: HTMLCanvasElement, quality = 0.85): string {
  return c.toDataURL('image/jpeg', quality).split(',')[1];
}
