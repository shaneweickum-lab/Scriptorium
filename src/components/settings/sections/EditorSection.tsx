import { useEditorSettings, EDITOR_FONTS, DEFAULT_EDITOR_SETTINGS } from '../../../store/editorSettingsStore';
import { SettingGroup, SettingRow, SectionHeader, SettingSlider } from '../SettingsPrimitives';

export function EditorSection() {
  const [settings, setSettings] = useEditorSettings();

  const resetEditor = () => setSettings({ ...DEFAULT_EDITOR_SETTINGS });

  return (
    <div>
      <SectionHeader
        title="Editor"
        description="Writing area appearance and behavior"
        onReset={resetEditor}
        resetLabel="Reset editor"
      />

      <div className="space-y-4">
        <SettingGroup title="Typography">
          <SettingRow
            label="Font family"
            description="Used in the writing editor"
            control={
              <select
                value={settings.fontValue}
                onChange={(e) => setSettings({ fontValue: e.target.value })}
                className="text-xs bg-white border border-slate-200 rounded-lg px-2 py-1.5 text-slate-700 focus:outline-none focus:ring-2 focus:ring-violet-500/40 focus:border-violet-400"
              >
                {EDITOR_FONTS.map((f) => (
                  <option key={f.value} value={f.value}>{f.label}</option>
                ))}
              </select>
            }
          />
          <SettingRow
            label="Font size"
            description="Text size in the editor (px)"
            control={
              <SettingSlider
                value={settings.fontSize}
                min={13}
                max={22}
                step={1}
                onChange={(v) => setSettings({ fontSize: v })}
                formatLabel={(v) => `${v}px`}
              />
            }
          />
          <SettingRow
            label="Line height"
            description="Vertical spacing between lines"
            control={
              <SettingSlider
                value={settings.lineHeight}
                min={1.4}
                max={2.4}
                step={0.1}
                onChange={(v) => setSettings({ lineHeight: v })}
                formatLabel={(v) => v.toFixed(1)}
              />
            }
          />
        </SettingGroup>

        <SettingGroup title="Layout">
          <SettingRow
            label="Editor width"
            description="Maximum content width (characters). 100+ = full width."
            control={
              <SettingSlider
                value={settings.maxWidthCh}
                min={45}
                max={120}
                step={5}
                onChange={(v) => setSettings({ maxWidthCh: v })}
                formatLabel={(v) => v >= 100 ? 'Full' : `${v}ch`}
              />
            }
          />
        </SettingGroup>

        {/* Live preview */}
        <div className="border border-slate-200 rounded-xl p-4 bg-slate-50">
          <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider mb-2">Preview</p>
          <p
            style={{
              fontFamily: EDITOR_FONTS.find((f) => f.value === settings.fontValue)?.stack ?? EDITOR_FONTS[0].stack,
              fontSize: settings.fontSize,
              lineHeight: settings.lineHeight,
            }}
            className="text-slate-700"
          >
            The ancient forest breathed with secrets older than the kingdoms above. Through gaps
            in the canopy, pale light drifted down like memory — slow, uncertain, beautiful.
          </p>
        </div>
      </div>
    </div>
  );
}
