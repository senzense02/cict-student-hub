// Initials in a circle. The tint comes from the name, so the same person always gets the same colour.
const TINTS = ['bg-lilac', 'bg-blush', 'bg-sand', 'bg-iris'];

export function tintFor(text = '') {
  // Simple string hash. `>>> 0` keeps it a positive number, so the modulo below is never negative
  let h = 0;
  for (const ch of text) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return TINTS[h % TINTS.length];
}

export default function Avatar({ name = '?', size = 32 }) {
  const initials = name.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]).join('').toUpperCase();
  return (
    <span className={`${tintFor(name)} grid shrink-0 place-items-center rounded-full font-medium text-plum-900`} style={{ width: size, height: size, fontSize: size * 0.38 }}>
      {initials}
    </span>
  );
}
