// Self-updating home-screen app. Each deploy writes its build id to
// version.json (never cached); the app compares it with its own and reloads
// into the new build. The reload goes to a one-off address (?v=<build>) that
// no cache — the browser's or an older service worker's — can answer with the
// old page, so one reload always lands on the new version. Nobody ever has to
// remove and re-add the app.

export const BUILD = String(import.meta.env.VITE_BUILD_ID ?? '');
const COOLDOWN_MS = 90_000;
const RELOAD_KEY = 'lbx-reload-at';

export function shouldReload(o: { mine: string; latest: string | null; now: number; lastReloadAt: number; foreground: boolean; idle: boolean }): boolean {
  if (!o.mine || !o.latest || o.latest === o.mine) return false;
  if (o.now - o.lastReloadAt < COOLDOWN_MS) return false; // never loop
  return o.foreground || o.idle;
}

export const updateUrl = (base: string, build: string) => `${base}?v=${build.slice(0, 12)}`;

export function withoutUpdateParam(search: string): string {
  const p = new URLSearchParams(search);
  p.delete('v');
  const s = p.toString();
  return s ? `?${s}` : '';
}

/** The deployed build id, or null when offline. */
export async function latestBuild(): Promise<string | null> {
  try {
    const r = await fetch(`${import.meta.env.BASE_URL}version.json?t=${Date.now()}`, { cache: 'no-store' });
    if (!r.ok) return null;
    const { build } = (await r.json()) as { build?: string };
    return build ? String(build) : null;
  } catch {
    return null;
  }
}

function lastReloadAt(): number {
  try {
    return Number(sessionStorage.getItem(RELOAD_KEY) ?? 0);
  } catch {
    return 0;
  }
}

/** Switch to the deployed build now. */
export async function reloadInto(build: string): Promise<void> {
  try {
    sessionStorage.setItem(RELOAD_KEY, String(Date.now()));
  } catch {
    // private mode: the cooldown just won't apply
  }
  const reg = await navigator.serviceWorker?.getRegistration().catch(() => undefined);
  await reg?.update().catch(() => {});
  window.location.replace(updateUrl(import.meta.env.BASE_URL, build));
}

/** Check once; reload when a newer build is live and now is a good moment. */
export async function checkForUpdate(o: { foreground: boolean; idle: () => boolean }): Promise<void> {
  const latest = await latestBuild();
  if (shouldReload({ mine: BUILD, latest, now: Date.now(), lastReloadAt: lastReloadAt(), foreground: o.foreground, idle: o.idle() })) await reloadInto(latest!);
}

/** After an update reload: tidy the one-off marker out of the address. */
export function cleanUpdateUrl() {
  if (!new URLSearchParams(location.search).has('v')) return;
  try {
    history.replaceState(history.state, '', `${location.pathname}${withoutUpdateParam(location.search)}${location.hash}`);
  } catch {
    // harmless if it stays
  }
}
