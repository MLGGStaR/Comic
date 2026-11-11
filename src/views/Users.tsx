// Users: everyone on Longbox (and letterSizd — one shared account system),
// you first. Each card shows their Comics, Read and Wishlist counts and what
// their collection is worth; tap a number for that shelf or portfolio, the
// name for their profile.
import { useEffect, useMemo } from 'react';
import { useActions } from '../state/actions';
import { useProfiles } from '../state/profiles';
import { useCollection } from '../state/collection';
import { loadEveryone, useEveryone } from '../state/everyone';
import { useOnRefresh } from '../state/refresh';
import { orderUsers, summarize, type UserSummary } from '../lib/users';
import { fmtMoney } from '../lib/format';
import type { Profile } from '../supabase';
import type { Shelf } from '../state/nav';
import { FriendDot } from '../ui/FriendDot';
import { Cover } from '../ui/Cover';
import { Icon } from '../ui/Icon';
import { Empty } from '../ui/layout';

export function UsersView() {
  const a = useActions();
  const profiles = useProfiles();
  const everyone = useEveryone();
  const mine = useCollection();

  useEffect(() => {
    if (a.selfId) void loadEveryone();
  }, [a.selfId]);
  useOnRefresh(() => (a.selfId ? loadEveryone() : undefined));

  // your own numbers come from your live collection, so they're always current
  const myLive = useMemo(() => (mine.loaded ? summarize([...mine.entries.values()]) : null), [mine.entries, mine.loaded]);
  const summaryOf = (id: string): UserSummary | null => (id === a.selfId && myLive ? myLive : everyone.byUser.get(id) ?? null);
  const people = orderUsers(profiles, a.selfId, (id) => summaryOf(id)?.tracked ?? 0);

  return (
    <div className="space-y-3">
      <div className="px-1">
        <div className="font-display text-[28px] font-extrabold leading-none">Users</div>
        <p className="text-xs text-ink-2 mt-1.5">
          Everyone on Longbox{profiles.length ? ` · ${profiles.length}` : ''}. Tap a number to see their comics, reads, wishlist or portfolio.
        </p>
      </div>
      {!a.selfId ? (
        <div className="card !p-3 text-xs text-ink-1">Log in to see everyone’s comics and what their collections are worth.</div>
      ) : everyone.error && !everyone.byUser.size ? (
        <div className="card !p-3 text-xs text-ink-1">Couldn’t load everyone’s comics — pull down to try again.</div>
      ) : null}
      {!profiles.length ? (
        <Empty title="Nobody here yet">Send friends the link — they sign up and show up here.</Empty>
      ) : (
        people.map((p) => <UserCard key={p.id} profile={p} me={p.id === a.selfId} s={summaryOf(p.id)} pending={!!a.selfId && !everyone.loaded && p.id !== a.selfId} />)
      )}
    </div>
  );
}

function UserCard({ profile, me, s, pending }: { profile: Profile; me: boolean; s: UserSummary | null; pending: boolean }) {
  const a = useActions();
  const signedIn = !!a.selfId;
  const empty = !pending && signedIn && (!s || !s.tracked);
  const stat = (shelf: Shelf, label: string, n: number | undefined, tone: string) => (
    <button
      onClick={() => a.openShelf(shelf, profile.id)}
      disabled={!n}
      className="rounded-xl bg-bg-2/70 py-2 text-center press disabled:opacity-50"
      aria-label={`${profile.username} · ${label} ${n ?? 0}`}
    >
      <div className={`font-display text-[18px] font-extrabold leading-none ${tone}`}>{pending ? '–' : n ?? 0}</div>
      <div className="text-[10px] font-semibold text-ink-2 mt-1">{label}</div>
    </button>
  );
  return (
    <div className={`card !p-3 ${me ? 'ring-1 ring-lb-green/40' : ''}`}>
      <button onClick={() => a.openUser(profile.id)} className="w-full flex items-center gap-3 text-left">
        <FriendDot profile={profile} size={44} />
        <div className="flex-1 min-w-0">
          <div className="text-[15px] font-semibold truncate">
            {profile.username}
            {me ? <span className="ml-2 text-[10px] font-bold text-lb-green align-middle">YOU</span> : null}
          </div>
          <div className="text-[11px] text-ink-2 truncate">
            {!signedIn ? 'Longbox user' : pending ? 'Loading…' : empty ? 'No comics yet' : `${s!.tracked} comic${s!.tracked === 1 ? '' : 's'} tracked`}
          </div>
        </div>
        {s?.recent.some((c) => c.cover) ? (
          <div className="flex -space-x-3 flex-shrink-0" aria-hidden>
            {s.recent.filter((c) => c.cover).slice(0, 3).map((c) => (
              <div key={c.id} className="w-7 aspect-[2/3] rounded overflow-hidden bg-bg-2 border border-black/30 shadow">
                <Cover src={c.cover} alt="" className="w-full h-full" />
              </div>
            ))}
          </div>
        ) : null}
        <Icon name="chevron-right" size={16} className="text-ink-2 flex-shrink-0" />
      </button>
      {signedIn && !empty ? (
        <div className="grid grid-cols-4 gap-1.5 mt-3">
          {stat('owned', 'Comics', s?.comics, 'text-lb-green')}
          {stat('read', 'Read', s?.read, 'text-lb-blue')}
          {stat('wishlist', 'Wishlist', s?.wishlist, 'text-lb-orange')}
          <button
            onClick={() => a.openPortfolio(profile.id)}
            disabled={!s?.comics}
            className="rounded-xl bg-bg-2/70 py-2 text-center press disabled:opacity-50"
            aria-label={`${profile.username} · Value ${fmtMoney(s?.value ?? 0)}`}
          >
            <div className="font-display text-[18px] font-extrabold leading-none text-ink-0 truncate px-1">{pending ? '–' : fmtMoney(s?.value ?? 0, { compact: true })}</div>
            <div className="text-[10px] font-semibold text-ink-2 mt-1">Value</div>
          </button>
        </div>
      ) : null}
    </div>
  );
}
