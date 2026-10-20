// Big coloured result shown after each scan (green ok, yellow exit, red problem), with a short vibration
// so staff can tell the result without looking at the screen.
import { useEffect, useState } from 'react';
import Icon from './Icon.jsx';

const KINDS = {
  green: { cls: 'bg-ok text-white', icon: 'check' },
  yellow: { cls: 'bg-warn text-ink', icon: 'exit' },
  red: { cls: 'bg-bad text-white', icon: 'x' },
  blue: { cls: 'bg-plum-700 text-white', icon: 'info' },
};

// Shows a scan result for a couple of seconds. show({ kind, title, subtitle }) / show(null)
export function useBanner(ms = 2600) {
  const [banner, setBanner] = useState(null);
  useEffect(() => {
    if (!banner) return;
    const t = setTimeout(() => setBanner(null), ms);
    return () => clearTimeout(t);
  }, [banner, ms]);
  const show = (b) => setBanner(b ? { ...b, at: Date.now() } : null);
  return [banner, show];
}

export default function Banner({ banner }) {
  useEffect(() => {
    if (banner && navigator.vibrate) navigator.vibrate(banner.kind === 'red' ? [120, 60, 120] : 80);
  }, [banner]);

  if (!banner)
    return (
      <div className="flex min-h-[148px] items-center gap-5 rounded-[28px] bg-rail px-7">
        <span className="grid h-14 w-14 shrink-0 place-items-center rounded-full bg-white text-plum-700"><Icon name="nfc" size={28} /></span>
        <div>
          <p className="font-display text-2xl font-medium tracking-tight text-plum-900">Ready for the next card</p>
          <p className="note">Hold a school ID to the back of the phone.</p>
        </div>
      </div>
    );

  const k = KINDS[banner.kind];
  return (
    <div key={banner.at} role="status" aria-live="polite" className={`pop flex min-h-[148px] items-center gap-5 rounded-[28px] px-7 ${k.cls}`}>
      <span className="grid h-14 w-14 shrink-0 place-items-center rounded-full bg-white/25"><Icon name={k.icon} size={30} /></span>
      <div className="min-w-0">
        <p className="font-display text-3xl font-semibold leading-tight tracking-tight sm:text-4xl">{banner.title}</p>
        {banner.subtitle && <p className="mt-1 text-lg opacity-90">{banner.subtitle}</p>}
      </div>
    </div>
  );
}
