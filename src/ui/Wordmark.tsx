// Two-tone wordmark, the letterSizd way: green + orange in the display face.
export function Wordmark({ size = 22 }: { size?: number }) {
  return (
    <div className="font-display font-extrabold leading-tight tracking-tight" style={{ fontSize: size }}>
      <span className="text-lb-green">long</span>
      <span className="text-lb-orange">box</span>
    </div>
  );
}
