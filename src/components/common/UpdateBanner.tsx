import { useEffect, useState } from 'react';
import { RefreshCw, X } from 'lucide-react';
import { isUpdateAvailable, subscribeToUpdateAvailable, applyUpdate } from '../../pwaUpdate';

/** Persistent, dismissible banner — never reloads on its own. */
export function UpdateBanner() {
  const [available, setAvailable] = useState(isUpdateAvailable);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => subscribeToUpdateAvailable(() => setAvailable(true)), []);

  if (!available || dismissed) return null;

  return (
    <div className="fixed bottom-4 left-4 z-[100] flex items-center gap-3 px-4 py-3 rounded-xl shadow-lg border border-violet-200 bg-white">
      <RefreshCw size={15} className="text-violet-500 shrink-0" />
      <span className="text-sm text-slate-700">
        A new version is ready.{' '}
        <button
          onClick={applyUpdate}
          className="font-semibold text-violet-600 hover:text-violet-800 transition-colors"
        >
          Reload to update
        </button>
      </span>
      <button
        onClick={() => setDismissed(true)}
        title="Dismiss (you'll be asked again next time)"
        className="text-slate-400 hover:text-slate-600 shrink-0 transition-colors"
      >
        <X size={14} />
      </button>
    </div>
  );
}
