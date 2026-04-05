import { useRef, useEffect } from 'react';
import { Settings2 } from 'lucide-react';
import { useEditorSettings, EDITOR_FONTS } from '../../store/editorSettingsStore';

interface Props {
  open: boolean;
  onClose: () => void;
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

export function EditorSettingsPanel({ open, onClose }: Props) {
  const [settings, setSettings] = useEditorSettings();
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handle = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    };
    document.addEventListener('mousedown', handle);
    return () => document.removeEventListener('mousedown', handle);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      ref={ref}
      className="absolute right-0 top-full mt-1 z-50 w-64
        bg-[#0d1526] border border-slate-700/60 rounded-xl shadow-2xl p-3 flex flex-col gap-3"
      style={{ boxShadow: '0 8px 40px rgba(0,0,0,0.6), 0 0 20px rgba(99,102,241,0.06)' }}
    >
      <p className="text-[10px] text-slate-500 uppercase tracking-wider">Editor Appearance</p>

      {/* Font family */}
      <div className="flex flex-col gap-1">
        <span className="text-[10px] text-slate-400">Font</span>
        <div className="grid grid-cols-2 gap-1">
          {EDITOR_FONTS.map((f) => (
            <button key={f.value} onClick={() => setSettings({ fontValue: f.value })}
              className={`px-2 py-1.5 rounded-lg text-xs text-left transition-colors truncate ${
                settings.fontValue === f.value
                  ? 'bg-indigo-600 text-white'
                  : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
              }`}
              style={{ fontFamily: f.stack }}>
              {f.label}
            </button>
          ))}
        </div>
      </div>

      <Slider label="Font size" value={settings.fontSize} min={13} max={22} step={1}
        format={(v) => `${v}px`} onChange={(v) => setSettings({ fontSize: v })} />

      <Slider label="Line height" value={settings.lineHeight} min={1.4} max={2.4} step={0.1}
        format={(v) => v.toFixed(1)} onChange={(v) => setSettings({ lineHeight: v })} />

      <Slider label="Max width" value={settings.maxWidthCh} min={45} max={100} step={5}
        format={(v) => `${v}ch`} onChange={(v) => setSettings({ maxWidthCh: v })} />

      {/* Reset */}
      <button onClick={() => setSettings({ fontValue: 'georgia', fontSize: 17, lineHeight: 1.9, maxWidthCh: 70 })}
        className="text-[10px] text-slate-600 hover:text-slate-400 text-center transition-colors pt-1 border-t border-slate-700/40">
        Reset to defaults
      </button>
    </div>
  );
}

export function EditorSettingsButton() {
  const [, ] = useEditorSettings();
  return <Settings2 size={14} />;
}
