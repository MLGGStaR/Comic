// Everyone on the shared letterSizd/Longbox account system.
import { useSyncExternalStore } from 'react';
import { supabase, type Profile } from '../supabase';
import { idbGet, idbSet } from '../lib/idb';

let profiles: Profile[] = [];
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());

export async function loadProfiles(): Promise<void> {
  if (!profiles.length) {
    const cached = await idbGet<Profile[]>('profiles');
    if (cached?.length) {
      profiles = cached;
      emit();
    }
  }
  const { data, error } = await supabase
    .from('profiles')
    .select('id, username, display_name, avatar_url')
    .order('username');
  if (error || !data) return;
  profiles = data as Profile[];
  emit();
  void idbSet('profiles', profiles);
}

export function useProfiles(): Profile[] {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => profiles,
  );
}

export function profileById(id: string | null | undefined): Profile | undefined {
  return id ? profiles.find((p) => p.id === id) : undefined;
}
