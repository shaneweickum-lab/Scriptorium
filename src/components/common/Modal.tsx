import React, { useEffect } from 'react';
import { X } from 'lucide-react';

interface ModalProps {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
  size?: 'sm' | 'md' | 'lg' | 'xl';
}

export function Modal({ title, onClose, children }: ModalProps) {
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-50 flex items-end md:items-center justify-center md:p-4">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <div className={`
        relative w-full md:w-1/2 md:min-w-[480px]
        border border-white/8 shadow-2xl
        rounded-t-2xl md:rounded-xl
        max-h-[90vh] overflow-y-auto
      `} style={{ background: '#13111f' }}>
        <div className="flex items-center justify-between p-4 border-b border-white/8 sticky top-0 z-10"
          style={{ background: '#13111f' }}>
          <h2 className="text-base font-semibold text-slate-100">{title}</h2>
          <button
            onClick={onClose}
            className="p-1 rounded-lg text-slate-400 hover:text-slate-200 hover:bg-white/10 transition-colors"
          >
            <X size={18} />
          </button>
        </div>
        <div className="p-4">{children}</div>
        {/* Safe area spacer for iOS */}
        <div className="h-safe-area-inset-bottom md:hidden" />
      </div>
    </div>
  );
}
