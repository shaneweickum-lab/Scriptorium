import { useSettingsStore, useSettings, creativityToTemperature } from '../../../store/settingsStore';
import { SettingGroup, SettingRow, SectionHeader, Toggle, Segmented, SettingSlider, InfoBanner } from '../SettingsPrimitives';

export function AISection() {
  const settings = useSettings();
  const updateSettings = useSettingsStore((s) => s.updateSettings);
  const resetSection = useSettingsStore((s) => s.resetSection);

  return (
    <div>
      <SectionHeader
        title="AI Behavior"
        description="Control how Meyvn AI approaches your writing"
        onReset={() => resetSection('ai')}
      />

      <div className="space-y-4">
        <SettingGroup title="Creativity">
          <SettingRow
            label="Creativity level"
            description={`Maps to AI temperature ${creativityToTemperature(settings.aiCreativity).toFixed(2)} — lower is more precise, higher is more imaginative`}
            control={
              <SettingSlider
                value={settings.aiCreativity}
                min={0}
                max={100}
                step={5}
                onChange={(v) => updateSettings({ aiCreativity: v })}
                formatLabel={(v) => v <= 20 ? 'Precise' : v >= 80 ? 'Wild' : `${v}`}
                width={160}
              />
            }
          />
          <SettingRow
            label="Response length"
            description="Preferred depth of AI responses"
            control={
              <Segmented
                value={settings.aiResponseLength}
                onChange={(v) => updateSettings({ aiResponseLength: v })}
                options={[
                  { value: 'short', label: 'Short' },
                  { value: 'medium', label: 'Medium' },
                  { value: 'long', label: 'Long' },
                ]}
              />
            }
          />
        </SettingGroup>

        <SettingGroup title="Initiative">
          <SettingRow
            label="AI initiative"
            description="How proactively Meyvn offers suggestions and alternatives"
            control={
              <Segmented
                value={settings.aiInitiative}
                onChange={(v) => updateSettings({ aiInitiative: v })}
                options={[
                  { value: 'conservative', label: 'Conservative' },
                  { value: 'collaborative', label: 'Collaborative' },
                  { value: 'exploratory', label: 'Exploratory' },
                ]}
              />
            }
          />
          <div className="py-2 text-xs text-slate-500 leading-relaxed">
            {settings.aiInitiative === 'conservative' && 'Answers exactly what you ask. Minimal unsolicited suggestions.'}
            {settings.aiInitiative === 'collaborative' && 'Offers useful alternatives and follows your lead. Default.'}
            {settings.aiInitiative === 'exploratory' && 'Actively identifies connections, implications, and possibilities.'}
          </div>
        </SettingGroup>

        <SettingGroup title="Feedback Style">
          <SettingRow
            label="AI criticism level"
            description="How directly Meyvn identifies weaknesses in your ideas"
            control={
              <Segmented
                value={settings.aiCriticism}
                onChange={(v) => updateSettings({ aiCriticism: v })}
                options={[
                  { value: 'gentle', label: 'Gentle' },
                  { value: 'balanced', label: 'Balanced' },
                  { value: 'direct', label: 'Direct' },
                ]}
              />
            }
          />
        </SettingGroup>

        <SettingGroup title="Canon Protection">
          <SettingRow
            label="Protect Canon"
            description="AI will not silently alter established canonical world information. Contradictions are flagged."
            control={
              <Toggle
                checked={settings.canonProtection}
                onChange={(v) => updateSettings({ canonProtection: v })}
                label="Protect Canon"
              />
            }
          />
          <SettingRow
            label="Require confirmation before canon changes"
            description="AI cannot automatically promote content to Canon without your explicit approval"
            control={
              <Toggle
                checked={settings.requireConfirmBeforeCanon}
                onChange={(v) => updateSettings({ requireConfirmBeforeCanon: v })}
                disabled={!settings.canonProtection}
                label="Require confirmation before canon changes"
              />
            }
          />
        </SettingGroup>

        {settings.canonProtection && (
          <InfoBanner>
            Canon protection is <strong>on</strong>. Meyvn will flag contradictions and keep
            AI-generated suggestions as proposals — your canon stays yours.
          </InfoBanner>
        )}
      </div>
    </div>
  );
}
