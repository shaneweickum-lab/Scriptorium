import { useSettingsStore, useSettings } from '../../../store/settingsStore';
import type { ContextSources } from '../../../store/settingsStore';
import { SettingGroup, SettingRow, SectionHeader, Toggle, Segmented, InfoBanner } from '../SettingsPrimitives';

const SOURCE_LABELS: { key: keyof ContextSources; label: string; description: string }[] = [
  { key: 'currentText', label: 'Current text', description: 'The scene or chapter you are writing' },
  { key: 'worldEntries', label: 'World Bible entries', description: 'Characters, locations, factions, and other lore' },
  { key: 'lore', label: 'Lore & history', description: 'Mythological, historical, and cultural lore entries' },
  { key: 'sketchpad', label: 'Sketchpad ideas', description: 'Raw and developing ideas from the Sketchpad' },
  { key: 'recentConversations', label: 'Recent conversations', description: 'Previous Meyvn chat turns in this session' },
];

export function ContextSection() {
  const settings = useSettings();
  const updateSettings = useSettingsStore((s) => s.updateSettings);
  const resetSection = useSettingsStore((s) => s.resetSection);

  const updateSource = (key: keyof ContextSources, value: boolean) => {
    updateSettings({
      contextSources: { ...settings.contextSources, [key]: value },
    });
  };

  const strategyDescriptions: Record<string, string> = {
    minimal: 'Only the current text. Fastest — no retrieval pass.',
    relevant: 'Retrieves the most relevant world entries for each request. Recommended.',
    extensive: 'Uses a broader slice of your world. Slower but richer context.',
  };

  return (
    <div>
      <SectionHeader
        title="Context & Memory"
        description="Control what information Meyvn AI may reference"
        onReset={() => resetSection('context')}
      />

      <div className="space-y-4">
        <SettingGroup title="Context Strategy">
          <SettingRow
            label="Strategy"
            description={strategyDescriptions[settings.contextStrategy]}
            control={
              <Segmented
                value={settings.contextStrategy}
                onChange={(v) => updateSettings({ contextStrategy: v })}
                options={[
                  { value: 'minimal', label: 'Minimal' },
                  { value: 'relevant', label: 'Relevant' },
                  { value: 'extensive', label: 'Extensive' },
                ]}
              />
            }
          />
        </SettingGroup>

        <SettingGroup title="Context Sources">
          {SOURCE_LABELS.map(({ key, label, description }) => (
            <SettingRow
              key={key}
              label={label}
              description={description}
              control={
                <Toggle
                  checked={settings.contextSources[key]}
                  onChange={(v) => updateSource(key, v)}
                  disabled={settings.contextStrategy === 'minimal' && key !== 'currentText'}
                  label={label}
                />
              }
              disabled={settings.contextStrategy === 'minimal' && key !== 'currentText'}
            />
          ))}
        </SettingGroup>

        {settings.contextStrategy === 'minimal' && (
          <InfoBanner variant="warning">
            Minimal strategy only uses the current text. Other sources are disabled.
          </InfoBanner>
        )}

        <InfoBanner>
          Context is determined per-request — only relevant information is sent.
          Your world data never leaves your device when using local models.
        </InfoBanner>
      </div>
    </div>
  );
}
