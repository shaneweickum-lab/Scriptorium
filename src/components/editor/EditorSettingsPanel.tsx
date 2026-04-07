import { useRef, useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { useEditorSettings, EDITOR_FONTS } from '../../store/editorSettingsStore';

interface Props {
  open: boolean;
  onClose: () => void;
  anchorRef: React.RefObject<HTMLElement | null>;
}

function Slider({
  label, value, min, max, step, format, onChange,
}: {
  label: string; value: number; min: number; max: number; step: number;
  format: (v: number) => string;
  onChange: (v: number) => void;
}) {
  return (
    <div className="flex flex-col gap-1">
      <div className="flex justify-between text-[10px]">
        <span className="text-slate-400">{label}</span>
        <span className="text-slate-300 font-medium">{format(value)}</span>
      </div>
      <input
        type="range" min={min} max={max} step={step} value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="w-full h-1 accent-indigo-500 cursor-pointer"
      />
    </div>
  );
}

export function EditorSettingsPanel({ open, onClose, anchorRef }: Props) {
  const [settings, setSettings] = useEditorSettings();
  const panelRef = useRef<HTMLDivElement>(null);
  const [coords, setCoords] = useState({ top: 0, right: 0 });

  // Recalculate position relative to anchor whenever the panel opens
  useEffect(() => {
    if (!open || !anchorRef.current) return;
    const rect = anchorRef.current.getBoundingClientRect();
    setCoords({
      top: rect.bottom + 4,
      right: window.innerWidth - rect.right,
    });
  }, [open]);

  // Close on outside click (exclude both the panel and the anchor button)
  useEffect(() => {
    if (!open) return;
    const handle = (e: MouseEvent) => {
      const target = e.target as Node;
      if (panelRef.current?.contains(target)) return;
      if (anchorRef.current?.contains(target)) return;
      onClose();
    };
    document.addEventListener('mousedown', handle);
    return () => document.removeEventListener('mousedown', handle);
  }, [open, onClose]);

  if (!open) return null;

  return createPortal(
    <div
      ref={panelRef}
      style={{
        position: 'fixed',
        top: coords.top,
        right: coords.right,
        zIndex: 300,
        boxShadow: '0 8px 40px rgba(0,0,0,0.6), 0 0 20px rgba(99,102,241,0.06)',
      }}
      className="w-64 bg-[#0d1526] border border-slate-700/60 rounded-xl p-3 flex flex-col gap-3"
    >
      <p className="text-[10px] text-slate-500 uppercase tracking-wider">Editor Appearance</p>

      {/* Font family */}
      <div className="flex flex-col gap-1">
        <span className="text-[10px] text-slate-400">Font</span>
        <div className="grid grid-cols-2 gap-1">
          {EDITOR_FONTS.map((f) => (
            <button
              key={f.value}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => setSettings({ fontValue: f.value })}
              className={`px-2 py-1.5 rounded-lg text-xs text-left transition-colors truncate ${
                settings.fontValue === f.value
                  ? 'bg-indigo-600 text-white'
                  : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
              }`}
              style={{ fontFamily: f.stack }}
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>

      <Slider label="Font size" value={settings.fontSize} min={13} max={22} step={1}
        format={(v) => `${v}px`} onChange={(v) => setSettings({ fontSize: v })} />

      <Slider label="Line height" value={settings.lineHeight} min={1.4} max={2.4} step={0.1}
        format={(v) => v.toFixed(1)} onChange={(v) => setSettings({ lineHeight: v })} />

      <Slider label="Max width" value={settings.maxWidthCh} min={45} max={120} step={5}
        format={(v) => (v >= 100 ? 'Full' : `${v}ch`)} onChange={(v) => setSettings({ maxWidthCh: v })} />

      <button
        onClick={() => setSettings({ fontValue: 'georgia', fontSize: 17, lineHeight: 1.9, maxWidthCh: 100 })}
        className="text-[10px] text-slate-600 hover:text-slate-400 text-center transition-colors pt-1 border-t border-slate-700/40"
      >
        Reset to defaults
      </button>
    </div>,
    document.body
  );
}
