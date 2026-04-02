import { CheckCircle, XCircle, Info, X } from 'lucide-react';
import { useUIStore } from '../../store/uiStore';

export function ToastContainer() {
  const toasts = useUIStore((s) => s.toasts);
  const removeToast = useUIStore((s) => s.removeToast);

  if (toasts.length === 0) return null;

  return (
    <div className="fixed bottom-4 right-4 z-[100] flex flex-col gap-2">
      {toasts.map((toast) => (
        <div
          key={toast.id}
          className="flex items-center gap-3 px-4 py-3 rounded-xl shadow-lg border animate-in slide-in-from-right"
          style={{
            background: toast.type === 'error' ? '#7f1d1d' : toast.type === 'info' ? '#1e3a5f' : '#14532d',
            borderColor: toast.type === 'error' ? '#dc2626' : toast.type === 'info' ? '#3b82f6' : '#16a34a',
          }}
        >
          {toast.type === 'success' && <CheckCircle size={16} className="text-green-400 shrink-0" />}
          {toast.type === 'error' && <XCircle size={16} className="text-red-400 shrink-0" />}
          {toast.type === 'info' && <Info size={16} className="text-blue-400 shrink-0" />}
          <span className="text-sm text-slate-200">{toast.message}</span>
          <button
            onClick={() => removeToast(toast.id)}
            className="text-slate-400 hover:text-slate-200 ml-1"
          >
            <X size={14} />
          </button>
        </div>
      ))}
    </div>
  );
}
