import type { Profile } from '../supabase';

export function FriendDot({ profile, size = 16 }: { profile: Pick<Profile, 'username' | 'avatar_url'>; size?: number }) {
  if (profile.avatar_url) {
    return (
      <img
        src={profile.avatar_url}
        alt=""
        style={{ width: size, height: size }}
        className="rounded-full object-cover flex-shrink-0 bg-bg-2"
      />
    );
  }
  return (
    <span
      style={{ width: size, height: size, fontSize: size * 0.55 }}
      className="rounded-full bg-bg-2 text-lb-blue font-bold flex items-center justify-center flex-shrink-0"
    >
      {profile.username.slice(0, 1).toUpperCase()}
    </span>
  );
}
