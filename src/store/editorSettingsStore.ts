const LS_KEY = 'wp_editor_settings';

export interface EditorFont {
  label: string;
  value: string;
  stack: string;
}

export const EDITOR_FONTS: EditorFont[] = [
  { label: 'Georgia', value: 'georgia', stack: 'Georgia, "Times New Roman", serif' },
  { label: 'Lora', value: 'lora', stack: '"Lora", Georgia, serif' },
  { label: 'Merriweather', value: 'merriweather', stack: '"Merriweather", Georgia, serif' },
  { label: 'Crimson Pro', value: 'crimson', stack: '"Crimson Pro", Georgia, serif' },
  { label: 'IM Fell English', value: 'imfell', stack: '"IM Fell English", Georgia, serif' },
  { label: 'Palatino', value: 'palatino', stack: '"Palatino Linotype", Palatino, serif' },
  { label: 'System Sans', value: 'sans', stack: 'system-ui, -apple-system, sans-serif' },
];

export interface EditorSettings {
  fontValue: string;   // key from EDITOR_FONTS
  fontSize: number;    // 14–22px
  lineHeight: number;  // 1.5–2.4
  maxWidthCh: number;  // 50–100 ch
}

export const DEFAULT_EDITOR_SETTINGS: EditorSettings = {
  fontValue: 'georgia',
  fontSize: 17,
  lineHeight: 1.9,
  maxWidthCh: 100,
};

function load(): EditorSettings {
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (raw) return { ...DEFAULT_EDITOR_SETTINGS, ...JSON.parse(raw) };
  } catch { /* ignore */ }
  return { ...DEFAULT_EDITOR_SETTINGS };
}

function save(s: EditorSettings) {
  localStorage.setItem(LS_KEY, JSON.stringify(s));
}

// Simple reactive store without Zustand — subscribers get notified on change
type Listener = () => void;
const listeners = new Set<Listener>();
let current: EditorSettings = load();

export const editorSettingsStore = {
  get(): EditorSettings { return current; },
  set(updates: Partial<EditorSettings>) {
    current = { ...current, ...updates };
    save(current);
    listeners.forEach((l) => l());
  },
  subscribe(l: Listener) {
    listeners.add(l);
    return () => listeners.delete(l);
  },
};

/** React hook */
import { useSyncExternalStore } from 'react';
export function useEditorSettings(): [EditorSettings, (updates: Partial<EditorSettings>) => void] {
  const settings = useSyncExternalStore(
    editorSettingsStore.subscribe.bind(editorSettingsStore),
    editorSettingsStore.get.bind(editorSettingsStore)
  );
  return [settings, editorSettingsStore.set.bind(editorSettingsStore)];
}

export function getEditorFont(fontValue: string): EditorFont {
  return EDITOR_FONTS.find((f) => f.value === fontValue) ?? EDITOR_FONTS[0];
}
