// Circular progress ring for the Door scanner and Review board tiles: shows `value` out of `total`.
// -rotate-90 on the svg makes the arc start at 12 o'clock and fill clockwise (SVG circles start at 3 o'clock).
export default function Ring({ value, total, size = 64, stroke = 8, color = 'var(--color-plum-700)', children }) {
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const pct = total ? Math.min(1, value / total) : 0; // an empty total shows an empty ring, not NaN
  return (
    <div className="relative shrink-0" style={{ width: size, height: size }} role="img" aria-label={`${Math.round(pct * 100)} percent`}>
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="rgba(255,255,255,0.75)" strokeWidth={stroke} />
        <circle className="ring-arc" style={{ '--c': c }} cx={size / 2} cy={size / 2} r={r} fill="none" stroke={color} strokeWidth={stroke} strokeLinecap="round" strokeDasharray={c} strokeDashoffset={c * (1 - pct)} />
      </svg>
      <div className="absolute inset-0 grid place-items-center text-[13px] font-semibold tabular-nums">{children ?? `${Math.round(pct * 100)}%`}</div>
    </div>
  );
}
