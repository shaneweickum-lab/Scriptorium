import { create } from 'zustand';
import { persist } from 'zustand/middleware';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type Theme = 'system' | 'light' | 'dark';
export type Density = 'comfortable' | 'compact';
export type AnimationLevel = 'full' | 'reduced' | 'off';
export type StartupBehavior = 'library' | 'last-world';
export type AIInitiative = 'conservative' | 'collaborative' | 'exploratory';
export type AICriticism = 'gentle' | 'balanced' | 'direct';
export type AIResponseLength = 'short' | 'medium' | 'long';
export type ContextStrategy = 'minimal' | 'relevant' | 'extensive';
export type AIProvider = 'ollama' | 'webgpu';

export interface ContextSources {
  currentText: boolean;
  worldEntries: boolean;
  lore: boolean;
  sketchpad: boolean;
  recentConversations: boolean;
}

export interface GlobalSettings {
  // General
  startupBehavior: StartupBehavior;
  confirmBeforeDelete: boolean;
  confirmBeforeCanonChange: boolean;

  // Appearance
  theme: Theme;
  density: Density;
  animationLevel: AnimationLevel;

  // AI
  aiCreativity: number;           // 0–100 → temperature 0.2–1.2
  aiResponseLength: AIResponseLength;
  aiInitiative: AIInitiative;
  aiCriticism: AICriticism;
  canonProtection: boolean;
  requireConfirmBeforeCanon: boolean;

  // Models
  provider: AIProvider;
  ollamaModel: string;
  ollamaUrl: string;
  webllmModel: string;

  // Context
  contextStrategy: ContextStrategy;
  contextSources: ContextSources;

  // Privacy
  saveAiConversations: boolean;
  preferLocalModels: boolean;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Map creativity 0–100 to temperature 0.2–1.2 */
export function creativityToTemperature(creativity: number): number {
  return Number((0.2 + (creativity / 100) * 1.0).toFixed(2));
}

/** Write legacy localStorage keys that existing components read */
function syncLegacyKeys(s: Partial<GlobalSettings>) {
  if (s.provider != null) localStorage.setItem('meyvn_provider', s.provider);
  if (s.ollamaModel != null) localStorage.setItem('meyvn_ollama_model', s.ollamaModel);
  if (s.webllmModel != null) localStorage.setItem('meyvn_webllm_model', s.webllmModel);
}

function readLegacyProvider(): AIProvider {
  const p = localStorage.getItem('meyvn_provider');
  return p === 'webgpu' ? 'webgpu' : 'ollama';
}

// ---------------------------------------------------------------------------
// Default state — migrates from legacy localStorage keys on first run
// ---------------------------------------------------------------------------

const DEFAULTS: GlobalSettings = {
  startupBehavior: 'library',
  confirmBeforeDelete: true,
  confirmBeforeCanonChange: true,

  theme: 'system',
  density: 'comfortable',
  animationLevel: 'full',

  aiCreativity: 50,
  aiResponseLength: 'medium',
  aiInitiative: 'collaborative',
  aiCriticism: 'balanced',
  canonProtection: true,
  requireConfirmBeforeCanon: true,

  provider: readLegacyProvider(),
  ollamaModel: localStorage.getItem('meyvn_ollama_model') ?? 'qwen3:8b',
  ollamaUrl: 'http://localhost:11434',
  webllmModel: localStorage.getItem('meyvn_webllm_model') ?? 'Qwen2.5-0.5B-Instruct-q4f16_1-MLC',

  contextStrategy: 'relevant',
  contextSources: {
    currentText: true,
    worldEntries: true,
    lore: true,
    sketchpad: false,
    recentConversations: true,
  },

  saveAiConversations: true,
  preferLocalModels: true,
};

// ---------------------------------------------------------------------------
// Store
// ---------------------------------------------------------------------------

interface SettingsState {
  settings: GlobalSettings;
  updateSettings: (changes: Partial<GlobalSettings>) => void;
  resetSection: (section: 'general' | 'appearance' | 'editor' | 'ai' | 'models' | 'context' | 'privacy') => void;
  resetAll: () => void;
}

export const useSettingsStore = create<SettingsState>()(
  persist(
    (set) => ({
      settings: DEFAULTS,

      updateSettings: (changes) => {
        syncLegacyKeys(changes);
        set((state) => ({ settings: { ...state.settings, ...changes } }));
      },

      resetSection: (section) => {
        const resets: Partial<Record<typeof section, Partial<GlobalSettings>>> = {
          general: {
            startupBehavior: DEFAULTS.startupBehavior,
            confirmBeforeDelete: DEFAULTS.confirmBeforeDelete,
            confirmBeforeCanonChange: DEFAULTS.confirmBeforeCanonChange,
          },
          appearance: {
            theme: DEFAULTS.theme,
            density: DEFAULTS.density,
            animationLevel: DEFAULTS.animationLevel,
          },
          ai: {
            aiCreativity: DEFAULTS.aiCreativity,
            aiResponseLength: DEFAULTS.aiResponseLength,
            aiInitiative: DEFAULTS.aiInitiative,
            aiCriticism: DEFAULTS.aiCriticism,
            canonProtection: DEFAULTS.canonProtection,
            requireConfirmBeforeCanon: DEFAULTS.requireConfirmBeforeCanon,
          },
          models: {
            provider: DEFAULTS.provider,
            ollamaModel: DEFAULTS.ollamaModel,
            ollamaUrl: DEFAULTS.ollamaUrl,
            webllmModel: DEFAULTS.webllmModel,
          },
          context: {
            contextStrategy: DEFAULTS.contextStrategy,
            contextSources: { ...DEFAULTS.contextSources },
          },
          privacy: {
            saveAiConversations: DEFAULTS.saveAiConversations,
            preferLocalModels: DEFAULTS.preferLocalModels,
          },
        };
        const patch = resets[section] ?? {};
        syncLegacyKeys(patch);
        set((state) => ({ settings: { ...state.settings, ...patch } }));
      },

      resetAll: () => {
        syncLegacyKeys(DEFAULTS);
        set({ settings: { ...DEFAULTS } });
      },
    }),
    {
      name: 'wp_global_settings',
      // Merge stored value with DEFAULTS so new keys appear on existing installs
      merge: (stored, current) => ({
        ...current,
        settings: { ...DEFAULTS, ...(stored as SettingsState).settings },
      }),
    }
  )
);

/** Convenience selector */
export const useSettings = () => useSettingsStore((s) => s.settings);
export const useUpdateSettings = () => useSettingsStore((s) => s.updateSettings);

// Apply theme/animation attributes to document root whenever settings change
useSettingsStore.subscribe((state) => {
  const { theme, animationLevel } = state.settings;
  const root = document.documentElement;

  // Theme
  const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
  const isDark = theme === 'dark' || (theme === 'system' && prefersDark);
  root.classList.toggle('dark', isDark);
  root.setAttribute('data-theme', theme);

  // Animations
  root.setAttribute('data-animations', animationLevel);
});
