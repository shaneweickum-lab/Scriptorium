import { useState } from 'react';
import { CheckCircle, XCircle, Loader2, Wifi } from 'lucide-react';
import { useSettingsStore, useSettings } from '../../../store/settingsStore';
import { SettingGroup, SettingRow, SectionHeader, Segmented, InfoBanner } from '../SettingsPrimitives';
import { OllamaService, OLLAMA_CHAT_MODELS, OLLAMA_DEFAULT_URL } from '../../../features/ai-engine/services/OllamaService';
import { WebLLMService, WEB_LLM_MODELS } from '../../../features/ai-engine/services/WebLLMService';

type HealthState = 'idle' | 'checking' | 'ok' | 'error';

export function ModelsSection() {
  const settings = useSettings();
  const updateSettings = useSettingsStore((s) => s.updateSettings);
  const resetSection = useSettingsStore((s) => s.resetSection);

  const [health, setHealth] = useState<HealthState>('idle');
  const [healthMsg, setHealthMsg] = useState('');

  const checkHealth = async () => {
    setHealth('checking');
    try {
      const svc = new OllamaService(settings.ollamaUrl);
      await svc.checkHealth();
      setHealth('ok');
      setHealthMsg('Connected');
    } catch (err) {
      setHealth('error');
      setHealthMsg(err instanceof Error ? err.message : 'Unreachable');
    }
  };

  const webgpuSupported = WebLLMService.isWebGPUSupported();

  return (
    <div>
      <SectionHeader
        title="Models"
        description="Select which AI models power different features"
        onReset={() => resetSection('models')}
      />

      <div className="space-y-4">
        {/* Provider */}
        <SettingGroup title="AI Provider">
          <SettingRow
            label="Active provider"
            description="Ollama runs models locally on your machine. WebGPU runs models directly in the browser."
            control={
              <Segmented
                value={settings.provider}
                onChange={(v) => updateSettings({ provider: v })}
                options={[
                  { value: 'ollama', label: 'Ollama' },
                  { value: 'webgpu', label: 'WebGPU' },
                ]}
              />
            }
          />
        </SettingGroup>

        {/* Ollama section */}
        {settings.provider === 'ollama' && (
          <>
            <SettingGroup title="Ollama Configuration">
              <SettingRow
                label="Model"
                description="The Ollama model tag to use for writing and chat"
                control={
                  <select
                    value={settings.ollamaModel}
                    onChange={(e) => updateSettings({ ollamaModel: e.target.value })}
                    className="text-xs bg-white border border-slate-200 rounded-lg px-2 py-1.5 text-slate-700 focus:outline-none focus:ring-2 focus:ring-violet-500/40 focus:border-violet-400"
                  >
                    {OLLAMA_CHAT_MODELS.map((m) => (
                      <option key={m.tag} value={m.tag}>{m.label} — {m.vram}</option>
                    ))}
                    {!OLLAMA_CHAT_MODELS.some((m) => m.tag === settings.ollamaModel) && (
                      <option value={settings.ollamaModel}>{settings.ollamaModel}</option>
                    )}
                  </select>
                }
              />
              <SettingRow
                label="Server URL"
                description="Ollama API endpoint. Change if running on a non-default port or remote host."
                control={
                  <input
                    type="url"
                    value={settings.ollamaUrl}
                    onChange={(e) => updateSettings({ ollamaUrl: e.target.value })}
                    placeholder={OLLAMA_DEFAULT_URL}
                    className="text-xs bg-white border border-slate-200 rounded-lg px-2.5 py-1.5 text-slate-700 focus:outline-none focus:ring-2 focus:ring-violet-500/40 focus:border-violet-400 w-52"
                  />
                }
              />
              <SettingRow
                label="Connection status"
                description="Verify that Ollama is reachable at the configured URL"
                control={
                  <div className="flex items-center gap-2">
                    {health === 'ok' && <CheckCircle size={13} className="text-teal-500" />}
                    {health === 'error' && <XCircle size={13} className="text-red-400" />}
                    {health === 'checking' && <Loader2 size={13} className="text-violet-400 animate-spin" />}
                    {(health === 'ok' || health === 'error') && (
                      <span className={`text-xs ${health === 'ok' ? 'text-teal-600' : 'text-red-500'}`}>
                        {healthMsg}
                      </span>
                    )}
                    <button
                      onClick={checkHealth}
                      disabled={health === 'checking'}
                      className="flex items-center gap-1 text-xs font-medium text-violet-600 hover:text-violet-700 px-2.5 py-1 rounded-lg bg-violet-50 hover:bg-violet-100 transition-colors disabled:opacity-50"
                    >
                      <Wifi size={11} />
                      Test
                    </button>
                  </div>
                }
              />
            </SettingGroup>

            <InfoBanner>
              Start Ollama with <code className="font-mono bg-violet-100 px-1 rounded">OLLAMA_ORIGINS="*" ollama serve</code>{' '}
              to allow browser access. Then pull a model with{' '}
              <code className="font-mono bg-violet-100 px-1 rounded">ollama pull {settings.ollamaModel}</code>.
            </InfoBanner>

            <SettingGroup title="Available Models">
              <div className="py-1">
                {OLLAMA_CHAT_MODELS.map((m) => (
                  <div
                    key={m.tag}
                    className={`flex items-start justify-between gap-3 py-2.5 border-b border-slate-100 last:border-0 cursor-pointer hover:bg-violet-50/50 -mx-4 px-4 transition-colors ${
                      settings.ollamaModel === m.tag ? 'bg-violet-50' : ''
                    }`}
                    onClick={() => updateSettings({ ollamaModel: m.tag })}
                  >
                    <div>
                      <p className="text-sm font-medium text-slate-700">{m.label}</p>
                      <p className="text-xs text-slate-400">{m.tag} · {m.vram}</p>
                      <p className="text-xs text-slate-400">{m.description}</p>
                    </div>
                    <div className="flex flex-col items-end gap-1 shrink-0">
                      {settings.ollamaModel === m.tag && (
                        <CheckCircle size={14} className="text-violet-500" />
                      )}
                      {m.recommended && settings.ollamaModel !== m.tag && (
                        <span className="text-[9px] font-semibold text-teal-600 bg-teal-50 px-1.5 py-0.5 rounded-full">
                          RECOMMENDED
                        </span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </SettingGroup>
          </>
        )}

        {/* WebGPU section */}
        {settings.provider === 'webgpu' && (
          <>
            {!webgpuSupported && (
              <InfoBanner variant="warning">
                WebGPU is not supported in this browser. Try Chrome 113+ or Edge 113+ on a desktop device.
              </InfoBanner>
            )}

            <SettingGroup title="WebGPU Model">
              <SettingRow
                label="Browser model"
                description="Runs entirely in your browser. No internet required after download."
                control={
                  <select
                    value={settings.webllmModel}
                    onChange={(e) => updateSettings({ webllmModel: e.target.value })}
                    disabled={!webgpuSupported}
                    className="text-xs bg-white border border-slate-200 rounded-lg px-2 py-1.5 text-slate-700 focus:outline-none focus:ring-2 focus:ring-violet-500/40 focus:border-violet-400 disabled:opacity-50"
                  >
                    {WEB_LLM_MODELS.map((m) => (
                      <option key={m.id} value={m.id}>{m.label} — {m.vram}</option>
                    ))}
                  </select>
                }
              />
              <SettingRow
                label="Status"
                description="Current WebGPU engine state"
                control={
                  <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${
                    WebLLMService.status === 'ready'
                      ? 'bg-teal-50 text-teal-600'
                      : WebLLMService.status === 'loading'
                      ? 'bg-blue-50 text-blue-600'
                      : WebLLMService.status === 'error'
                      ? 'bg-red-50 text-red-500'
                      : 'bg-slate-100 text-slate-500'
                  }`}>
                    {WebLLMService.status === 'ready' ? 'Ready'
                      : WebLLMService.status === 'loading' ? 'Loading…'
                      : WebLLMService.status === 'error' ? 'Error'
                      : 'Not loaded'}
                  </span>
                }
              />
            </SettingGroup>

            <SettingGroup title="Available Browser Models">
              <div className="py-1">
                {WEB_LLM_MODELS.map((m) => (
                  <div
                    key={m.id}
                    className={`flex items-start justify-between gap-3 py-2.5 border-b border-slate-100 last:border-0 cursor-pointer hover:bg-violet-50/50 -mx-4 px-4 transition-colors ${
                      settings.webllmModel === m.id ? 'bg-violet-50' : ''
                    }`}
                    onClick={() => webgpuSupported && updateSettings({ webllmModel: m.id })}
                  >
                    <div>
                      <p className="text-sm font-medium text-slate-700">{m.label}</p>
                      <p className="text-xs text-slate-400">{m.id}</p>
                      <p className="text-xs text-slate-400">Download size: {m.vram}</p>
                    </div>
                    {settings.webllmModel === m.id && (
                      <CheckCircle size={14} className="text-violet-500 shrink-0 mt-0.5" />
                    )}
                  </div>
                ))}
              </div>
            </SettingGroup>

            <InfoBanner>
              Open the <strong>Meyvn panel</strong> to load the selected model into memory.
              Downloaded model weights are cached by your browser for offline use.
            </InfoBanner>
          </>
        )}
      </div>
    </div>
  );
}
