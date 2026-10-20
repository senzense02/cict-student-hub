import { useState } from 'react';
import { useAuth } from '../context/AuthContext.jsx';
import CardLinkModal from './CardLinkModal.jsx';

// Shows whether the signed-in student or event staff member has an ID card linked.
// Tap it to open the popup where they can link their card.
export default function CardStatus({ className = '', compact = false }) {
  const { user } = useAuth();
  const [open, setOpen] = useState(false);

  if (typeof user.hasCard !== 'boolean') return null; // not known yet

  const linked = user.hasCard;
  const label = linked ? (compact ? 'Linked' : 'Card linked') : (compact ? 'Not linked' : 'Card not linked');
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-haspopup="dialog"
        title={linked ? 'Your ID card is linked to this account' : 'Your ID card is not linked yet. Tap to link it.'}
        className={`inline-flex h-7 items-center gap-2 rounded-full bg-rail px-3 text-xs font-medium text-plum-900 transition-colors hover:bg-plum-200 ${className}`}
      >
        <span className={`h-2 w-2 rounded-full ${linked ? 'bg-ok' : 'bg-warn'}`} />
        {label}
      </button>
      {open && <CardLinkModal onClose={() => setOpen(false)} />}
    </>
  );
}
