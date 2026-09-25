// Gear sheet: your profile photo (shared with letterSizd), friends, log out.
import { useRef, useState } from 'react';
import type { Session } from '@supabase/supabase-js';
import { supabase } from '../supabase';
import { Sheet } from '../ui/Sheet';
import { FriendDot } from '../ui/FriendDot';
import { loadProfiles, useProfiles } from '../state/profiles';
import { useCollection } from '../state/collection';
import { useNav } from '../state/nav';
import { Icon } from '../ui/Icon';

export function SettingsSheet({ session, onClose }: { session: Session | null; onClose: () => void }) {
  const profiles = useProfiles();
  const me = session ? profiles.find((p) => p.id === session.user.id) : undefined;
  const { entries, syncing } = useCollection();
  const nav = useNav();
  const fileRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const pickPhoto = async (f: File | undefined) => {
    if (!f || !me) return;
    setBusy(true);
    setErr(null);
    try {
      const img = await createImageBitmap(f);
      const size = 256;
      const canvas = document.createElement('canvas');
      canvas.width = size;
      canvas.height = size;
      const ctx = canvas.getContext('2d')!;
      const s = Math.min(img.width, img.height);
      ctx.drawImage(img, (img.width - s) / 2, (img.height - s) / 2, s, s, 0, 0, size, size);
      const blob = await new Promise<Blob>((res, rej) =>
        canvas.toBlob((b) => (b ? res(b) : rej(new Error('encode failed'))), 'image/jpeg', 0.85),
      );
      const path = `${me.id}/avatar.jpg`;
      const { error: upErr } = await supabase.storage.from('avatars').upload(path, blob, { upsert: true, contentType: 'image/jpeg' });
      if (upErr) throw new Error(upErr.message);
      const { data } = supabase.storage.from('avatars').getPublicUrl(path);
      const { error: pErr } = await supabase.from('profiles').update({ avatar_url: `${data.publicUrl}?t=${Date.now()}` }).eq('id', me.id);
      if (pErr) throw new Error(pErr.message);
      await loadProfiles();
    } catch (e) {
      setErr(String((e as Error).message ?? e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Sheet onClose={onClose} label="Settings">
      {me ? (
        <div className="flex items-center gap-3 mb-4">
          <FriendDot profile={me} size={52} />
          <div className="flex-1 min-w-0">
            <div className="font-display text-lg font-extrabold truncate">{me.username}</div>
            <div className="text-[11px] text-ink-2">
              {entries.size} comics{syncing ? ' · syncing…' : ''}
            </div>
            {err ? <div className="text-[11px] text-red-400">{err}</div> : null}
          </div>
          <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={(e) => pickPhoto(e.target.files?.[0])} />
          <button onClick={() => fileRef.current?.click()} disabled={busy} className="btn-secondary !py-2 !px-3 text-xs disabled:opacity-50">
            {busy ? '…' : me.avatar_url ? 'Change photo' : 'Add photo'}
          </button>
        </div>
      ) : (
        <div className="card mb-4 text-sm text-ink-1">Browsing without an account — log in to save comics.</div>
      )}

      <button
        onClick={() => {
          onClose();
          window.setTimeout(() => nav.push({ t: 'friends' }), 60);
        }}
        className="w-full flex items-center gap-3 p-3.5 rounded-2xl bg-bg-2/70 active:bg-bg-2 mb-2"
      >
        <Icon name="users" size={20} className="text-lb-blue" />
        <span className="flex-1 text-left text-sm font-semibold">Friends</span>
        <span className="text-xs text-ink-2">{Math.max(0, profiles.length - (me ? 1 : 0))}</span>
        <Icon name="chevron-right" size={16} className="text-ink-2" />
      </button>

      <p className="text-[11px] text-ink-2 leading-relaxed px-1 my-4">
        Comic data, covers, community ratings and reviews come from League of Comic Geeks. Values are estimates.
      </p>

      {session ? (
        <button
          onClick={() => {
            onClose();
            void supabase.auth.signOut({ scope: 'local' });
          }}
          className="w-full py-3 rounded-xl text-sm font-semibold text-red-400 bg-bg-2/60"
        >
          Log out
        </button>
      ) : (
        <button
          onClick={() => {
            localStorage.removeItem('lbx-guest');
            window.location.reload();
          }}
          className="w-full btn-primary !py-3"
        >
          Log in or create account
        </button>
      )}
      <div className="text-center text-[10px] text-ink-2 mt-4">Longbox · build {String(import.meta.env.VITE_BUILD_ID ?? 'dev').slice(0, 7)}</div>
    </Sheet>
  );
}
