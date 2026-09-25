// The + menu (My Comics and Search): scan a cover, scan a barcode, or type it.
import { Sheet } from '../ui/Sheet';
import { Icon, type IconName } from '../ui/Icon';

type Pick = 'cover' | 'barcode' | 'search';

export function AddMenu({ onClose, onPick }: { onClose: () => void; onPick: (k: Pick) => void }) {
  const items: { k: Pick; icon: IconName; title: string; sub: string; tone: string }[] = [
    { k: 'cover', icon: 'camera', title: 'Scan cover', sub: 'Point at the front of the comic', tone: 'from-lb-green/25 text-lb-green' },
    { k: 'barcode', icon: 'barcode', title: 'Scan barcode', sub: 'Fastest for a stack of books', tone: 'from-lb-blue/25 text-lb-blue' },
    { k: 'search', icon: 'type', title: 'Type it', sub: '“absolute batman #2”', tone: 'from-lb-orange/25 text-lb-orange' },
  ];
  return (
    <Sheet onClose={onClose} label="Add comics">
      <div className="font-display text-lg font-extrabold mb-3 px-1">Add comics</div>
      <div className="space-y-2">
        {items.map((it) => (
          <button
            key={it.k}
            onClick={() => onPick(it.k)}
            className="w-full flex items-center gap-4 p-3.5 rounded-2xl bg-bg-2/70 active:bg-bg-2 text-left"
          >
            <span className={`w-12 h-12 rounded-xl bg-gradient-to-br to-transparent flex items-center justify-center ${it.tone}`}>
              <Icon name={it.icon} size={26} />
            </span>
            <span className="flex-1 min-w-0">
              <span className="block text-[15px] font-semibold text-ink-0">{it.title}</span>
              <span className="block text-xs text-ink-2 mt-0.5">{it.sub}</span>
            </span>
            <Icon name="chevron-right" size={18} className="text-ink-2" />
          </button>
        ))}
      </div>
    </Sheet>
  );
}
