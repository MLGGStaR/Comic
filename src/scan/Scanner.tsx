// placeholder — replaced once the barcode library is chosen
export function Scanner({ onClose }: { mode: 'barcode' | 'cover'; onMode: (m: 'barcode' | 'cover') => void; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 bg-black flex items-center justify-center" onClick={onClose}>
      <span className="text-ink-2 text-sm">Scanner</span>
    </div>
  );
}
