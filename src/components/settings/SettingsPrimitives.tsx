/**
 * Shared primitives for the Settings UI.
 * Keep components small and prop-driven — sections compose these.
 */
import React from 'react';
import { RotateCcw, AlertTriangle } from 'lucide-react';

// ---------------------------------------------------------------------------
// SettingRow — label + description on the left, control on the right
// ---------------------------------------------------------------------------

interface SettingRowProps {
  label: string;
  description?: string;
  control: React.ReactNode;
  disabled?: boolean;
}

export function SettingRow({ label, description, control, disabled }: SettingRowProps) {
  return (
    <div className={`flex items-center justify-between gap-4 py-3 ${disabled ? 'opacity-50' : ''}`}>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-slate-700">{label}</p>
        {description && (
          <p className="text-xs text-slate-400 mt-0.5 leading-relaxed">{description}</p>
        )}
      </div>
      <div className="shrink-0">{control}</div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// SettingGroup — titled sub-group with dividers between rows
// ---------------------------------------------------------------------------

interface SettingGroupProps {
  title?: string;
  children: React.ReactNode;
  className?: string;
}

export function SettingGroup({ title, children, className = '' }: SettingGroupProps) {
  return (
    <div className={`bg-white border border-slate-200 rounded-xl overflow-hidden ${className}`}>
      {title && (
        <div className="px-4 py-2.5 bg-slate-50 border-b border-slate-200">
          <p className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">{title}</p>
        </div>
      )}
      <div className="divide-y divide-slate-100 px-4">
        {children}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// SectionHeader — top of each settings page
// ---------------------------------------------------------------------------

interface SectionHeaderProps {
  title: string;
  description?: string;
  onReset?: () => void;
  resetLabel?: string;
}

export function SectionHeader({ title, description, onReset, resetLabel = 'Reset to defaults' }: SectionHeaderProps) {
  return (
    <div className="flex items-start justify-between gap-4 mb-5">
      <div>
        <h3 className="text-base font-semibold text-slate-800">{title}</h3>
        {description && <p className="text-sm text-slate-500 mt-0.5">{description}</p>}
      </div>
      {onReset && (
        <button
          onClick={onReset}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-slate-500 hover:text-slate-700 hover:bg-slate-100 transition-colors shrink-0"
        >
          <RotateCcw size={11} />
          {resetLabel}
        </button>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Toggle
// ---------------------------------------------------------------------------

interface ToggleProps {
  checked: boolean;
  onChange: (val: boolean) => void;
  disabled?: boolean;
  label?: string;
}

export function Toggle({ checked, onChange, disabled, label }: ToggleProps) {
  return (
    <button
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 focus:outline-none focus:ring-2 focus:ring-violet-500/40 disabled:cursor-not-allowed ${
        checked
          ? 'bg-gradient-to-r from-violet-600 to-teal-600'
          : 'bg-slate-200'
      }`}
    >
      <span
        className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow-sm ring-0 transition duration-200 ${
          checked ? 'translate-x-4' : 'translate-x-0'
        }`}
      />
    </button>
  );
}

// ---------------------------------------------------------------------------
// Segmented — 2-4 option pill switcher
// ---------------------------------------------------------------------------

interface SegmentedProps<T extends string> {
  value: T;
  options: { value: T; label: string }[];
  onChange: (val: T) => void;
  size?: 'sm' | 'md';
}

export function Segmented<T extends string>({ value, options, onChange, size = 'sm' }: SegmentedProps<T>) {
  const px = size === 'sm' ? 'px-2.5 py-1 text-[11px]' : 'px-3 py-1.5 text-xs';
  return (
    <div className="flex rounded-lg bg-slate-100 p-0.5 gap-0.5">
      {options.map((opt) => (
        <button
          key={opt.value}
          onClick={() => onChange(opt.value)}
          className={`${px} font-medium rounded-md transition-all ${
            value === opt.value
              ? 'bg-white text-violet-700 shadow-sm'
              : 'text-slate-500 hover:text-slate-700'
          }`}
        >
          {opt.label}
        </button>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// SettingSlider
// ---------------------------------------------------------------------------

interface SettingSliderProps {
  value: number;
  min: number;
  max: number;
  step?: number;
  onChange: (val: number) => void;
  formatLabel?: (val: number) => string;
  width?: number;
}

export function SettingSlider({ value, min, max, step = 1, onChange, formatLabel, width = 140 }: SettingSliderProps) {
  return (
    <div className="flex items-center gap-2" style={{ width }}>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="flex-1 h-1.5 appearance-none rounded-full bg-slate-200 accent-violet-600 cursor-pointer"
      />
      <span className="text-xs text-slate-500 w-10 text-right shrink-0">
        {formatLabel ? formatLabel(value) : value}
      </span>
    </div>
  );
}

// ---------------------------------------------------------------------------
// DangerZone — visually distinct section for destructive actions
// ---------------------------------------------------------------------------

interface DangerZoneProps {
  children: React.ReactNode;
}

export function DangerZone({ children }: DangerZoneProps) {
  return (
    <div className="border border-red-200 rounded-xl overflow-hidden mt-6">
      <div className="px-4 py-2.5 bg-red-50 border-b border-red-200 flex items-center gap-2">
        <AlertTriangle size={12} className="text-red-500" />
        <p className="text-[11px] font-semibold text-red-600 uppercase tracking-wider">Danger Zone</p>
      </div>
      <div className="divide-y divide-red-100 px-4 bg-white">
        {children}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// InfoBanner — explanatory note
// ---------------------------------------------------------------------------

interface InfoBannerProps {
  children: React.ReactNode;
  variant?: 'info' | 'warning';
}

export function InfoBanner({ children, variant = 'info' }: InfoBannerProps) {
  const styles = variant === 'warning'
    ? 'bg-amber-50 border-amber-200 text-amber-700'
    : 'bg-violet-50 border-violet-200 text-violet-700';
  return (
    <div className={`text-xs px-3 py-2.5 rounded-xl border leading-relaxed ${styles}`}>
      {children}
    </div>
  );
}
