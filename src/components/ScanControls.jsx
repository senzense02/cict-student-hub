import { useState } from 'react';
import { useNfc } from '../lib/nfc.js';
import { normalizeToken } from '../lib/logic.js';
import Icon from './Icon.jsx';

// Start/stop the phone's NFC reader, plus a manual box so you can test on a laptop.
export default function ScanControls({ onToken, active = true, manual: showManual = true }) {
  const nfc = useNfc(onToken);
  const [manual, setManual] = useState('');

  return (
    <div className="rounded-3xl border border-line bg-white p-4">
      <div className="flex flex-wrap items-center gap-3">
        {nfc.scanning ? (
          <button onClick={nfc.stop} className="btn btn-soft"><Icon name="x" size={16} />Stop scanning</button>
        ) : (
          <button onClick={nfc.start} disabled={!active} className="btn btn-primary"><Icon name="nfc" size={18} />Start scanning</button>
        )}
        <span className="flex items-center gap-2 text-sm text-muted">
          <span className={`h-2.5 w-2.5 rounded-full ${nfc.scanning ? 'bg-ok' : 'bg-line'}`} />
          {nfc.scanning ? 'Scanning. Hold a card to the back of the phone.' : nfc.supported ? 'Not scanning' : 'NFC is not available on this device'}
        </span>
      </div>
      {nfc.error && <p className="alert mt-3">{nfc.error}</p>}

      {showManual && <details className="mt-3 text-sm">
        <summary className="cursor-pointer text-muted">Test without a card</summary>
        <div className="mt-2 flex gap-2">
          <input value={manual} onChange={(e) => setManual(e.target.value)} placeholder="Card ID, e.g. 04A1B2C3D4E5F1" className="field" />
          <button disabled={!active} onClick={() => manual.trim() && onToken(normalizeToken(manual))} className="btn btn-line shrink-0">Simulate tap</button>
        </div>
      </details>}
    </div>
  );
}
