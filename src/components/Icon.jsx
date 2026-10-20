const PATHS = {
  board: <><rect x="3" y="3" width="7" height="7" rx="2.2" /><rect x="14" y="3" width="7" height="7" rx="2.2" /><rect x="3" y="14" width="7" height="7" rx="2.2" /><rect x="14" y="14" width="7" height="7" rx="2.2" /></>,
  overview: <path d="M5 20v-7M12 20V5M19 20v-10" />,
  log: <><rect x="5" y="3.5" width="14" height="17" rx="3" /><path d="M9 8.5h6M9 12h6M9 15.5h3.5" /></>,
  door: <><path d="M6 21V4.5A1.5 1.5 0 0 1 7.5 3h9A1.5 1.5 0 0 1 18 4.5V21M3 21h18" /><circle cx="14.5" cy="12.5" r="0.9" fill="currentColor" stroke="none" /></>,
  card: <><rect x="3" y="5" width="18" height="14" rx="3.5" /><circle cx="9" cy="11" r="2" /><path d="M6.3 16c.7-1.4 1.7-2 2.7-2s2 .6 2.7 2M14.5 10h3.5M14.5 13.5H17" /></>,
  users: <><circle cx="9" cy="8" r="3.2" /><path d="M3 20c.6-3.4 3-5 6-5s5.4 1.6 6 5" /><circle cx="17" cy="9" r="2.4" /><path d="M17.5 14.2c2 .3 3.2 1.7 3.5 4" /></>,
  logout: <><path d="M10 4H6.5A2.5 2.5 0 0 0 4 6.5v11A2.5 2.5 0 0 0 6.5 20H10M15 8l4 4-4 4M19 12H9" /></>,
  check: <path d="M5 12.5l4.5 4.5L19 7.5" />,
  x: <path d="M6 6l12 12M18 6L6 18" />,
  up: <path d="M6 14.5l6-6 6 6" />,
  down: <path d="M6 9.5l6 6 6-6" />,
  exit: <path d="M14 4h3.5A2.5 2.5 0 0 1 20 6.5v11a2.5 2.5 0 0 1-2.5 2.5H14M9.5 8L5.5 12l4 4M5.5 12H15" />,
  upload: <path d="M12 16V5M7.5 9.5L12 5l4.5 4.5M5 19h14" />,
  shield: <><path d="M12 3l7 3v5.2c0 4.4-3 7.8-7 9.8-4-2-7-5.4-7-9.8V6z" /><path d="M9 12l2.2 2.2L15.5 10" /></>,
  sync: <path d="M20 11a8 8 0 0 0-14.5-4M4 13a8 8 0 0 0 14.5 4M5 4v4h4M19 20v-4h-4" />,
  nfc: <path d="M8.5 8.5c2.2 2.2 2.2 4.8 0 7M12.5 6c3.6 3.4 3.6 8.6 0 12M16.5 3.5c5 4.6 5 12.4 0 17" />,
  info: <><circle cx="12" cy="12" r="9" /><path d="M12 11v5M12 8v.01" /></>,
  plus: <path d="M12 5v14M5 12h14" />,
};

export default function Icon({ name, size = 20, className = '' }) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden="true">
      {PATHS[name]}
    </svg>
  );
}
