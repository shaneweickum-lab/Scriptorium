import { useSettingsStore, useSettings } from '../../../store/settingsStore';
import { SettingGroup, SettingRow, SectionHeader, Segmented, InfoBanner } from '../SettingsPrimitives';

export function AppearanceSection() {
  const settings = useSettings();
  const updateSettings = useSettingsStore((s) => s.updateSettings);
  const resetSection = useSettingsStore((s) => s.resetSection);

  return (
    <div>
      <SectionHeader
        title="Appearance"
        description="Customize how Wizard's Playground looks and feels"
        onReset={() => resetSection('appearance')}
      />

      <div className="space-y-4">
        <SettingGroup title="Theme">
          <SettingRow
            label="Color scheme"
            description="System will follow your OS preference automatically"
            control={
              <Segmented
                value={settings.theme}
                onChange={(v) => updateSettings({ theme: v })}
                options={[
                  { value: 'system', label: 'System' },
                  { value: 'light', label: 'Light' },
                  { value: 'dark', label: 'Dark' },
                ]}
              />
            }
          />
        </SettingGroup>

        <InfoBanner variant="warning">
          <strong>Dark mode is in progress.</strong> The preference is saved and the document class is applied —
          full component-level dark styling ships in a future update.
        </InfoBanner>

        <SettingGroup title="Layout">
          <SettingRow
            label="Interface density"
            description="Compact reduces spacing in lists and panels"
            control={
              <Segmented
                value={settings.density}
                onChange={(v) => updateSettings({ density: v })}
                options={[
                  { value: 'comfortable', label: 'Comfortable' },
                  { value: 'compact', label: 'Compact' },
                ]}
              />
            }
          />
        </SettingGroup>

        <SettingGroup title="Motion">
          <SettingRow
            label="Animations"
            description="Reduced and Off honor prefers-reduced-motion. Changes apply immediately."
            control={
              <Segmented
                value={settings.animationLevel}
                onChange={(v) => updateSettings({ animationLevel: v })}
                options={[
                  { value: 'full', label: 'Full' },
                  { value: 'reduced', label: 'Reduced' },
                  { value: 'off', label: 'Off' },
                ]}
              />
            }
          />
        </SettingGroup>
      </div>
    </div>
  );
}
