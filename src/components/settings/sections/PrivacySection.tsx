import { useSettingsStore, useSettings } from '../../../store/settingsStore';
import { SettingGroup, SettingRow, SectionHeader, Toggle, InfoBanner } from '../SettingsPrimitives';

export function PrivacySection() {
  const settings = useSettings();
  const updateSettings = useSettingsStore((s) => s.updateSettings);
  const resetSection = useSettingsStore((s) => s.resetSection);

  return (
    <div>
      <SectionHeader
        title="Privacy"
        description="Control how your writing data is handled"
        onReset={() => resetSection('privacy')}
      />

      <div className="space-y-4">
        <InfoBanner>
          Wizard's Playground is <strong>local-first</strong>. Your worlds, characters, and writing
          are stored on your device in IndexedDB and never sent to a server unless you explicitly
          use cloud backup or a cloud AI provider.
        </InfoBanner>

        <SettingGroup title="AI Data">
          <SettingRow
            label="Save AI conversations"
            description="Persist chat history between sessions so you can continue previous conversations"
            control={
              <Toggle
                checked={settings.saveAiConversations}
                onChange={(v) => updateSettings({ saveAiConversations: v })}
                label="Save AI conversations"
              />
            }
          />
          <SettingRow
            label="Prefer local models"
            description="Prioritize Ollama and WebGPU inference. Your prompts stay on your device."
            control={
              <Toggle
                checked={settings.preferLocalModels}
                onChange={(v) => updateSettings({ preferLocalModels: v })}
                label="Prefer local models"
              />
            }
          />
        </SettingGroup>

        <SettingGroup title="Local Processing">
          <SettingRow
            label="Vector index"
            description="World Bible embeddings are computed locally and stored in memory. They are not persisted to disk or sent anywhere."
            control={<span className="text-xs font-medium text-teal-600 bg-teal-50 px-2 py-0.5 rounded-full">Local only</span>}
          />
          <SettingRow
            label="Style analysis"
            description="Writing style profiling is computed locally from your text. Stored in localStorage, never transmitted."
            control={<span className="text-xs font-medium text-teal-600 bg-teal-50 px-2 py-0.5 rounded-full">Local only</span>}
          />
          <SettingRow
            label="Oracle profile"
            description="Corpus statistics derived locally from your scenes. Stored in localStorage."
            control={<span className="text-xs font-medium text-teal-600 bg-teal-50 px-2 py-0.5 rounded-full">Local only</span>}
          />
        </SettingGroup>

        <SettingGroup title="Cloud Backup (Optional)">
          <SettingRow
            label="Cloud backup"
            description="When signed in, you may back up your project to Supabase. Backup is manual and opt-in."
            control={<span className="text-xs font-medium text-slate-500 bg-slate-100 px-2 py-0.5 rounded-full">Manual opt-in</span>}
          />
        </SettingGroup>
      </div>
    </div>
  );
}
