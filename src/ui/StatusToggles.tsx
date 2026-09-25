// The three collection switches, used by the quick-log sheet and the comic
// page. Owning clears the wishlist; the wishlist is hidden while you own it.
import type { ComicLite } from '../types';
import { collection, useEntry } from '../state/collection';
import { useActions } from '../state/actions';
import { Icon, type IconName } from './Icon';

export function StatusToggles({ comic, size = 'md' }: { comic: ComicLite; size?: 'md' | 'lg' }) {
  const entry = useEntry(comic.id);
  const a = useActions();
  const owned = !!entry?.owned;
  const read = !!entry?.read;
  const wish = !!entry?.wishlist;
  const toggle = (patch: Parameters<typeof collection.patch>[1]) => {
    if (!a.requireLogin()) return;
    navigator.vibrate?.(8);
    void collection.patch(comic, patch);
  };
  return (
    <div className="grid grid-cols-3 gap-2">
      <Toggle
        on={owned}
        icon="box"
        label={owned ? 'Have it' : 'Have it'}
        tone="green"
        size={size}
        onClick={() => toggle({ owned: !owned })}
      />
      <Toggle on={read} icon="book" label="Read" tone="blue" size={size} onClick={() => toggle({ read: !read })} />
      <Toggle
        on={wish}
        icon="bookmark"
        label="Wishlist"
        tone="orange"
        size={size}
        disabled={owned}
        onClick={() => toggle({ wishlist: !wish })}
      />
    </div>
  );
}

function Toggle({
  on,
  icon,
  label,
  tone,
  size,
  disabled,
  onClick,
}: {
  on: boolean;
  icon: IconName;
  label: string;
  tone: 'green' | 'blue' | 'orange';
  size: 'md' | 'lg';
  disabled?: boolean;
  onClick: () => void;
}) {
  const onCls =
    tone === 'green'
      ? 'bg-lb-green text-bg-0 shadow-[0_0_18px_rgba(0,215,53,0.35)]'
      : tone === 'blue'
      ? 'bg-lb-blue text-bg-0 shadow-[0_0_18px_rgba(64,188,244,0.35)]'
      : 'bg-lb-orange text-bg-0 shadow-[0_0_18px_rgba(255,128,0,0.35)]';
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      aria-pressed={on}
      className={`flex flex-col items-center justify-center gap-1 rounded-2xl font-semibold transition-colors duration-150 disabled:opacity-35 ${
        size === 'lg' ? 'py-3 text-[13px]' : 'py-2.5 text-[12px]'
      } ${on ? onCls : 'bg-bg-2 text-ink-1'}`}
    >
      <Icon name={on ? (icon === 'box' ? 'check' : icon) : icon} size={size === 'lg' ? 22 : 20} strokeWidth={on ? 2.6 : 2} />
      {label}
    </button>
  );
}
