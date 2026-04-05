import { CheckCircle, XCircle, Info, X, Trophy } from 'lucide-react';
import { useUIStore } from '../../store/uiStore';

export function ToastContainer() {
  const toasts = useUIStore((s) => s.toasts);
  const removeToast = useUIStore((s) => s.removeToast);

  if (toasts.length === 0) return null;

  return (
    <div className="fixed bottom-4 right-4 z-[100] flex flex-col gap-2">
      {toasts.map((toast) => {
        const isAchievement = toast.type === 'achievement';
        return (
          <div
            key={toast.id}
            className="flex items-center gap-3 px-4 py-3 rounded-xl shadow-lg border animate-in slide-in-from-right"
            style={
              isAchievement
                ? {
                    background: 'linear-gradient(135deg, #3b1f6b 0%, #1e1040 100%)',
                    borderColor: '#7c3aed',
                    boxShadow: '0 0 20px rgba(124,58,237,0.35)',
                  }
                : {
                    background:
                      toast.type === 'error'
                        ? '#7f1d1d'
                        : toast.type === 'info'
                        ? '#1e3a5f'
                        : '#14532d',
                    borderColor:
                      toast.type === 'error'
                        ? '#dc2626'
                        : toast.type === 'info'
                        ? '#3b82f6'
                        : '#16a34a',
                  }
            }
          >
            {isAchievement ? (
              <span className="text-xl shrink-0">{toast.achievementEmoji ?? '🏆'}</span>
            ) : toast.type === 'success' ? (
              <CheckCircle size={16} className="text-green-400 shrink-0" />
            ) : toast.type === 'error' ? (
              <XCircle size={16} className="text-red-400 shrink-0" />
            ) : (
              <Info size={16} className="text-blue-400 shrink-0" />
            )}

            <div className="flex flex-col min-w-0">
              {isAchievement && (
                <span className="text-[9px] font-bold tracking-[0.18em] uppercase text-violet-400 leading-none mb-0.5">
                  Achievement Unlocked
                </span>
              )}
              <span className={`text-sm ${isAchievement ? 'text-white font-semibold' : 'text-slate-200'}`}>
                {isAchievement
                  ? toast.message.replace(/  \+\d+ XP$/, '')
                  : toast.message}
              </span>
              {isAchievement && (toast.achievementXP ?? 0) > 0 && (
                <span className="text-xs text-amber-400 font-bold mt-0.5">
                  +{toast.achievementXP} XP
                </span>
              )}
            </div>

            <button
              onClick={() => removeToast(toast.id)}
              className="text-slate-400 hover:text-slate-200 ml-1 shrink-0"
            >
              <X size={14} />
            </button>
          </div>
        );
      })}
    </div>
  );
}

// Re-export Trophy for convenience
export { Trophy };
