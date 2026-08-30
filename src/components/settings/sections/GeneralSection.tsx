import { useSettingsStore, useSettings } from '../../../store/settingsStore';
import { SettingGroup, SettingRow, SectionHeader, Toggle, Segmented } from '../SettingsPrimitives';

export function GeneralSection() {
  const settings = useSettings();
  const updateSettings = useSettingsStore((s) => s.updateSettings);
  const resetSection = useSettingsStore((s) => s.resetSection);

  return (
    <div>
      <SectionHeader
        title="General"
        description="Application-wide preferences"
        onReset={() => resetSection('general')}
      />

      <div className="space-y-4">
        <SettingGroup title="Startup">
          <SettingRow
            label="When app opens"
            description="Where to land after launching Wizard's Playground"
            control={
              <Segmented
                value={settings.startupBehavior}
                onChange={(v) => updateSettings({ startupBehavior: v })}
                options={[
                  { value: 'library', label: 'Library' },
                  { value: 'last-world', label: 'Last world' },
                ]}
              />
            }
          />
        </SettingGroup>

        <SettingGroup title="Confirmations">
          <SettingRow
            label="Confirm before deleting"
            description="Show a dialog before permanently removing worlds, chapters, or entries"
            control={
              <Toggle
                checked={settings.confirmBeforeDelete}
                onChange={(v) => updateSettings({ confirmBeforeDelete: v })}
                label="Confirm before deleting"
              />
            }
          />
          <SettingRow
            label="Confirm before canon changes"
            description="Require explicit confirmation when promoting content to Canon"
            control={
              <Toggle
                checked={settings.confirmBeforeCanonChange}
                onChange={(v) => updateSettings({ confirmBeforeCanonChange: v })}
                label="Confirm before canon changes"
              />
            }
          />
        </SettingGroup>

        <SettingGroup title="Current Project Settings">
          <SettingRow
            label="Book title, structure, word goal, color"
            description="Per-project settings are managed separately for each world"
            control={
              <button
                onClick={() => {
                  // Trigger ProjectSettings modal via uiStore — import-free via DOM event
                  window.dispatchEvent(new CustomEvent('open-project-settings'));
                }}
                className="text-xs font-medium text-violet-600 hover:text-violet-700 px-3 py-1.5 rounded-lg bg-violet-50 hover:bg-violet-100 transition-colors"
              >
                Open Project Settings →
              </button>
            }
          />
        </SettingGroup>
      </div>
    </div>
  );
}
