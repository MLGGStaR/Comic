import { Screen } from '../ui/Screen';
import { useProfiles } from '../state/profiles';
import { useActions } from '../state/actions';
import { FriendDot } from '../ui/FriendDot';
import { Icon } from '../ui/Icon';
import { Empty } from '../ui/layout';

export function FriendsScreen({ onClose }: { onClose: () => void }) {
  const profiles = useProfiles();
  const a = useActions();
  const friends = profiles.filter((p) => p.id !== a.selfId);
  return (
    <Screen onClose={onClose} title="Friends">
      <div className="px-4 pb-24">
        <div className="font-display text-[28px] font-extrabold leading-none mb-1">Friends</div>
        <p className="text-xs text-ink-2 mb-4">Everyone on Longbox and letterSizd. Tap to see their comics.</p>
        {!friends.length ? (
          <Empty title="No friends yet">Send them the link — they sign up and show up here.</Empty>
        ) : (
          <div className="space-y-2">
            {friends.map((p) => (
              <button key={p.id} onClick={() => a.openUser(p.id)} className="w-full card !p-3 flex items-center gap-3 text-left press">
                <FriendDot profile={p} size={40} />
                <div className="flex-1 min-w-0 text-sm font-semibold truncate">{p.username}</div>
                <Icon name="chevron-right" size={16} className="text-ink-2" />
              </button>
            ))}
          </div>
        )}
      </div>
    </Screen>
  );
}
