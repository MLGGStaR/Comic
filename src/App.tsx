import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { Session } from '@supabase/supabase-js';
import { supabase } from './supabase';
import { AuthScreen } from './Auth';
import { NavProvider, useNav, type Route } from './state/nav';
import { ActionsCtx, type Actions } from './state/actions';
import { collection, useCollection } from './state/collection';
import { loadFollows } from './state/follows';
import { portfolio } from './lib/shelf';
import { recordValue } from './ui/ValueSparkline';
import { loadProfiles, useProfiles } from './state/profiles';
import { refreshAll } from './state/refresh';
import { Icon, type IconName } from './ui/Icon';
import { Wordmark } from './ui/Wordmark';
import { Toasts, toast } from './ui/toast';
import { popBack, hasBack } from './lib/backstack';
import type { ComicLite } from './types';
import { HomeView } from './views/Home';
import { SearchView } from './views/Search';
import { CalendarView } from './views/Calendar';
import { MyComicsView } from './views/MyComics';
import { ComicScreen } from './screens/ComicScreen';
import { SeriesScreen } from './screens/SeriesScreen';
import { ShelfScreen } from './screens/ShelfScreen';
import { PortfolioScreen } from './screens/PortfolioScreen';
import { ProfileScreen } from './screens/ProfileScreen';
import { FriendsScreen } from './screens/FriendsScreen';
import { StatsScreen } from './screens/StatsScreen';
import { QuickLogSheet } from './sheets/QuickLog';
import { AddMenu } from './sheets/AddMenu';
import { SettingsSheet } from './sheets/Settings';
import { Scanner } from './scan/Scanner';

type Tab = 'home' | 'search' | 'calendar' | 'comics';
const TABS: { id: Tab; icon: IconName; label: string }[] = [
  { id: 'home', icon: 'home', label: 'Home' },
  { id: 'search', icon: 'search', label: 'Search' },
  { id: 'calendar', icon: 'calendar', label: 'Calendar' },
  { id: 'comics', icon: 'box', label: 'My Comics' },
];

export function App() {
  return (
    <NavProvider>
      <Shell />
    </NavProvider>
  );
}

function Shell() {
  const [session, setSession] = useState<Session | null>(null);
  const [authReady, setAuthReady] = useState(false);
  const [guest, setGuest] = useState(() => localStorage.getItem('lbx-guest') === '1');
  const [tab, setTab] = useState<Tab>(() => {
    const t = localStorage.getItem('lbx-tab') as Tab | null;
    return t && TABS.some((x) => x.id === t) ? t : 'home';
  });
  const [refreshing, setRefreshing] = useState(false);
  const [quick, setQuick] = useState<ComicLite | null>(null);
  const [addOpen, setAddOpen] = useState(false);
  const [scanMode, setScanMode] = useState<'barcode' | 'cover' | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [needNewPassword, setNeedNewPassword] = useState(false);
  const nav = useNav();
  useProfiles();

  useEffect(() => localStorage.setItem('lbx-tab', tab), [tab]);

  // ── auth ──
  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setAuthReady(true);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((evt, s) => {
      setSession(s);
      if (evt === 'PASSWORD_RECOVERY') setNeedNewPassword(true);
      if (s) {
        setGuest(false);
        localStorage.removeItem('lbx-guest');
      }
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  const selfId = session?.user.id ?? null;
  useEffect(() => {
    if (selfId) void collection.load(selfId);
    else collection.clear();
    void loadFollows(selfId);
    if (selfId || guest) void loadProfiles();
  }, [selfId, guest]);

  // one value-history point per day for the portfolio chart
  const { entries: myEntries, loaded: collectionLoaded } = useCollection();
  useEffect(() => {
    if (!selfId || !collectionLoaded) return;
    const t = window.setTimeout(() => {
      const p = portfolio([...myEntries.values()]);
      if (p.owned) void recordValue(selfId, p.total, p.owned);
    }, 4000);
    return () => window.clearTimeout(t);
  }, [selfId, collectionLoaded, myEntries]);

  // ── auto-update: a new deploy reloads the app once (90s cooldown) ──
  useEffect(() => {
    const mine = import.meta.env.VITE_BUILD_ID as string | undefined;
    if (!mine) return;
    const check = async () => {
      try {
        const r = await fetch(`${import.meta.env.BASE_URL}version.json?t=${Date.now()}`, { cache: 'no-store' });
        if (!r.ok) return;
        const { build } = (await r.json()) as { build?: string };
        if (build && String(build) !== String(mine)) {
          const last = Number(sessionStorage.getItem('lbx-reload-at') ?? 0);
          if (Date.now() - last < 90_000) return;
          sessionStorage.setItem('lbx-reload-at', String(Date.now()));
          const reg = await navigator.serviceWorker?.getRegistration();
          await reg?.update().catch(() => {});
          window.location.reload();
        }
      } catch {
        // offline
      }
    };
    void check();
    const onVis = () => {
      if (document.visibilityState === 'visible') void check();
    };
    document.addEventListener('visibilitychange', onVis);
    return () => document.removeEventListener('visibilitychange', onVis);
  }, []);

  const doRefresh = useCallback(async () => {
    if (refreshing) return;
    setRefreshing(true);
    try {
      await Promise.allSettled([selfId ? collection.load(selfId) : null, loadProfiles(), refreshAll()]);
    } finally {
      setRefreshing(false);
    }
  }, [refreshing, selfId]);

  // foreground return → quietly re-pull the collection
  useEffect(() => {
    const onVis = () => {
      if (document.visibilityState === 'visible' && selfId) void collection.load(selfId);
    };
    document.addEventListener('visibilitychange', onVis);
    return () => document.removeEventListener('visibilitychange', onVis);
  }, [selfId]);

  // ── pull-to-refresh (direct DOM writes; never React state per frame) ──
  const pullElRef = useRef<HTMLDivElement | null>(null);
  const doRefreshRef = useRef(doRefresh);
  doRefreshRef.current = doRefresh;
  useEffect(() => {
    let startY = 0;
    let startX = 0;
    let pulling = false;
    let cur = 0;
    const paint = (p: number) => {
      cur = p;
      const el = pullElRef.current;
      if (!el) return;
      el.style.opacity = String(Math.min(1, p / 50));
      el.style.transform = `translate(-50%, ${p}px) rotate(${p * 4}deg)`;
      el.style.color = p > 55 ? '#00d735' : '#8494ad';
    };
    const reset = () => {
      const el = pullElRef.current;
      if (el) {
        el.style.transition = 'transform 180ms ease, opacity 180ms ease';
        paint(0);
        window.setTimeout(() => {
          if (el) el.style.transition = '';
        }, 200);
      }
      cur = 0;
    };
    const onStart = (e: TouchEvent) => {
      pulling = false;
      if (window.scrollY > 2 || hasBack()) return;
      if ((e.target as Element | null)?.closest?.('.z-40, .z-50, [data-nopull]')) return;
      startY = e.touches[0].clientY;
      startX = e.touches[0].clientX;
      pulling = true;
    };
    const onMove = (e: TouchEvent) => {
      if (!pulling) return;
      const dy = e.touches[0].clientY - startY;
      const dx = Math.abs(e.touches[0].clientX - startX);
      if (dy < 6) {
        if (dy < -4) pulling = false;
        return;
      }
      if (dx > dy || window.scrollY > 2) {
        pulling = false;
        reset();
        return;
      }
      if (e.cancelable) e.preventDefault();
      paint(Math.min(90, dy * 0.45));
    };
    const onEnd = () => {
      if (!pulling) return;
      pulling = false;
      const hit = cur > 55;
      reset();
      if (hit) void doRefreshRef.current();
    };
    document.addEventListener('touchstart', onStart, { passive: true });
    document.addEventListener('touchmove', onMove, { passive: false });
    document.addEventListener('touchend', onEnd);
    document.addEventListener('touchcancel', onEnd);
    return () => {
      document.removeEventListener('touchstart', onStart);
      document.removeEventListener('touchmove', onMove);
      document.removeEventListener('touchend', onEnd);
      document.removeEventListener('touchcancel', onEnd);
    };
  }, []);

  // every tab opens at the top
  useEffect(() => {
    window.scrollTo({ top: 0 });
  }, [tab]);

  // lock the page behind pushed screens so it can't scroll underneath
  useEffect(() => {
    if (nav.stack.length) {
      document.documentElement.style.overflow = 'hidden';
      // also prevent any pointer events on the page behind the screens
      document.documentElement.style.pointerEvents = 'none';
      // but allow pointer events on the screens themselves (z-40+)
      const screens = document.querySelectorAll('.screen-in, .z-40, .z-50');
      screens.forEach((el) => (el as HTMLElement).style.pointerEvents = '');
    } else {
      document.documentElement.style.overflow = '';
      document.documentElement.style.pointerEvents = '';
    }
  }, [nav.stack.length]);

  const push = nav.push;
  const actions = useMemo<Actions>(
    () => ({
      selfId,
      openComic: (c) => push({ t: 'comic', id: c.id, seed: c }),
      openComicId: (id) => push({ t: 'comic', id }),
      openSeries: (id, title) => push({ t: 'series', id, title }),
      openShelf: (shelf, userId) => push({ t: 'shelf', shelf, userId }),
      openPortfolio: (userId) => push({ t: 'portfolio', userId }),
      openUser: (userId) => push({ t: 'profile', userId }),
      openStats: (userId) => push({ t: 'stats', userId }),
      quickLog: (c) => {
        if (!selfId) return toast('Log in to track comics');
        setQuick(c);
      },
      openAdd: () => setAddOpen(true),
      openScanner: (mode) => setScanMode(mode),
      requireLogin: () => {
        if (selfId) return true;
        toast('Log in to track comics');
        return false;
      },
    }),
    [selfId, push],
  );

  if (!authReady) {
    return <div className="min-h-screen" />;
  }
  if (!session && !guest) {
    return (
      <AuthScreen
        onSkip={() => {
          localStorage.setItem('lbx-guest', '1');
          setGuest(true);
        }}
      />
    );
  }

  return (
    <ActionsCtx.Provider value={actions}>
      <div className="min-h-screen flex flex-col">
        <header className="sticky top-0 z-20 bg-bg-0/95 backdrop-blur" style={{ paddingTop: 'env(safe-area-inset-top)' }}>
          <div className="relative px-4 py-3 text-center">
            <Wordmark />
            <button
              onClick={() => setSettingsOpen(true)}
              aria-label="Settings"
              className="absolute left-3 top-1/2 -translate-y-1/2 p-2.5 rounded-full text-ink-2 active:bg-bg-2/60"
            >
              <Icon name="gear" size={20} />
            </button>
            <button
              onClick={() => void doRefresh()}
              disabled={refreshing}
              aria-label="Refresh"
              className="absolute right-3 top-1/2 -translate-y-1/2 p-2.5 rounded-full text-ink-2 active:bg-bg-2/60 disabled:opacity-60"
            >
              <Icon name="refresh" size={18} strokeWidth={2.5} className={refreshing ? 'animate-spin' : ''} />
            </button>
          </div>
        </header>

        <main className="flex-1 px-3 pt-3" style={{ paddingBottom: 'calc(104px + env(safe-area-inset-bottom))' }}>
          <div key={tab} className="tab-in">
            {tab === 'home' ? (
              <HomeView />
            ) : tab === 'search' ? (
              <SearchView />
            ) : tab === 'calendar' ? (
              <CalendarView />
            ) : (
              <MyComicsView />
            )}
          </div>
        </main>

        <div
          ref={pullElRef}
          className="fixed left-1/2 z-30 pointer-events-none"
          style={{ top: 'calc(env(safe-area-inset-top) + 6px)', opacity: 0, transform: 'translate(-50%, 0)' }}
        >
          <div className="w-9 h-9 rounded-full bg-bg-2 border border-white/10 shadow-lg flex items-center justify-center">
            <Icon name="refresh" size={18} strokeWidth={2.5} />
          </div>
        </div>

        <nav
          className="fixed left-4 right-4 z-30 rounded-full bg-bg-1/85 backdrop-blur-xl border border-white/10 shadow-[0_12px_40px_rgba(0,0,0,0.55)] max-w-lg mx-auto"
          style={{ bottom: 'calc(12px + env(safe-area-inset-bottom))' }}
        >
          <div className="flex items-stretch justify-around py-2.5 px-2">
            {TABS.map((t) => {
              const on = tab === t.id;
              return (
                <button
                  key={t.id}
                  onClick={() => {
                    if (on) window.scrollTo({ top: 0, behavior: 'smooth' });
                    setTab(t.id);
                  }}
                  aria-label={t.label}
                  aria-current={on ? 'page' : undefined}
                  className="flex items-center justify-center px-4 py-1 min-w-[56px]"
                >
                  <span className={on ? 'text-lb-green [filter:drop-shadow(0_0_7px_rgba(0,215,53,0.7))]' : 'text-ink-2'}>
                    <Icon name={t.icon} />
                  </span>
                </button>
              );
            })}
          </div>
        </nav>

        {nav.stack.map((r, i) => (
          <RouteLayer key={routeKey(r)} route={r} onClose={() => nav.closeAt(i)} />
        ))}

        {quick ? <QuickLogSheet comic={quick} onClose={() => setQuick(null)} /> : null}
        {addOpen ? (
          <AddMenu
            onClose={() => setAddOpen(false)}
            onPick={(k) => {
              setAddOpen(false);
              if (k === 'search') {
                while (hasBack()) popBack();
                setTab('search');
                window.setTimeout(() => document.getElementById('search-input')?.focus(), 350);
              } else {
                setScanMode(k);
              }
            }}
          />
        ) : null}
        {scanMode ? <Scanner mode={scanMode} onMode={setScanMode} onClose={() => setScanMode(null)} /> : null}
        {settingsOpen ? <SettingsSheet session={session} onClose={() => setSettingsOpen(false)} /> : null}
        {needNewPassword && session ? <PasswordReset onDone={() => setNeedNewPassword(false)} /> : null}
        <Toasts />
      </div>
    </ActionsCtx.Provider>
  );
}

function routeKey(r: Route): string {
  switch (r.t) {
    case 'comic':
    case 'series':
      return `${r.t}:${r.id}`;
    case 'shelf':
      return `shelf:${r.shelf}:${r.userId}`;
    case 'portfolio':
    case 'profile':
    case 'stats':
      return `${r.t}:${r.userId}`;
    default:
      return r.t;
  }
}

function RouteLayer({ route, onClose }: { route: Route; onClose: () => void }) {
  switch (route.t) {
    case 'comic':
      return <ComicScreen id={route.id} seed={route.seed} onClose={onClose} />;
    case 'series':
      return <SeriesScreen id={route.id} title={route.title} onClose={onClose} />;
    case 'shelf':
      return <ShelfScreen shelf={route.shelf} userId={route.userId} onClose={onClose} />;
    case 'portfolio':
      return <PortfolioScreen userId={route.userId} onClose={onClose} />;
    case 'profile':
      return <ProfileScreen userId={route.userId} onClose={onClose} />;
    case 'friends':
      return <FriendsScreen onClose={onClose} />;
    case 'stats':
      return <StatsScreen userId={route.userId} onClose={onClose} />;
  }
}

function PasswordReset({ onDone }: { onDone: () => void }) {
  const [pw, setPw] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const save = async () => {
    if (pw.length < 6) return setErr('Min 6 characters');
    setBusy(true);
    const { error } = await supabase.auth.updateUser({ password: pw });
    setBusy(false);
    if (error) return setErr(error.message);
    onDone();
  };
  return (
    <div className="fixed inset-0 z-50 bg-bg-0/85 backdrop-blur-sm flex items-center justify-center p-6 fade-in">
      <div className="card w-full max-w-sm space-y-3">
        <div className="text-sm font-semibold">New password</div>
        <input
          type="password"
          value={pw}
          onChange={(e) => setPw(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && save()}
          placeholder="New password"
          autoFocus
          className="w-full bg-bg-2 border border-transparent rounded-lg px-4 py-2.5 text-sm focus:outline-none focus:border-lb-blue"
        />
        {err ? <div className="text-xs text-red-400">{err}</div> : null}
        <button onClick={save} disabled={busy || pw.length < 6} className="w-full btn-primary disabled:opacity-50">
          {busy ? '…' : 'Save'}
        </button>
      </div>
    </div>
  );
}
