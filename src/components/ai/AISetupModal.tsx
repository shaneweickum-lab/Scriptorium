/**
 * AISetupModal — full setup guide for Meyvn AI.
 *
 * Two tabs:
 *   Setup Guide — step-by-step Ollama install + CORS command
 *   Models      — all supported models with VRAM requirements and pull commands
 *
 * Includes a live connection probe for Ollama (port 11434).
 */

import { useState, useEffect, useCallback } from 'react';
import {
  X, Cpu, Wifi, WifiOff, RefreshCw, Copy, Check,
  ChevronRight, AlertCircle, Loader2, Sparkles,
} from 'lucide-react';
import { OllamaService, OLLAMA_CHAT_MODELS } from '../../features/ai-engine/services/OllamaService';
import { WEB_LLM_MODELS } from '../../features/ai-engine/services/WebLLMService';

interface AISetupModalProps {
  onClose: () => void;
}

type SetupTab = 'guide' | 'models';
type OllamaProbeStatus = 'checking' | 'ok' | 'cors' | 'unreachable';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    await navigator.clipboard.writeText(text).catch(() => {});
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };
  return (
    <button
      onClick={copy}
      title="Copy"
      className="absolute top-2 right-2 flex items-center justify-center w-6 h-6 rounded bg-slate-700 hover:bg-slate-600 text-slate-300 transition-colors"
    >
      {copied ? <Check size={11} className="text-teal-400" /> : <Copy size={11} />}
    </button>
  );
}

function CodeBlock({ code }: { code: string }) {
  return (
    <div className="relative">
      <pre className="bg-slate-900 text-slate-200 rounded-lg px-4 py-3 text-xs font-mono leading-relaxed overflow-x-auto pr-10">
        {code}
      </pre>
      <CopyButton text={code} />
    </div>
  );
}

function StepRow({ n, children }: { n: number; children: React.ReactNode }) {
  return (
    <div className="flex gap-3">
      <div className="w-6 h-6 rounded-full bg-violet-100 text-violet-700 flex items-center justify-center text-[11px] font-bold shrink-0 mt-0.5">
        {n}
      </div>
      <div className="flex-1 min-w-0 space-y-1.5">{children}</div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export function AISetupModal({ onClose }: AISetupModalProps) {
  const [tab, setTab] = useState<SetupTab>('guide');
  const [probeStatus, setProbeStatus] = useState<OllamaProbeStatus>('checking');

  const probe = useCallback(async () => {
    setProbeStatus('checking');
    const svc = new OllamaService();
    const ok = await svc.checkHealth();
    if (ok) { setProbeStatus('ok'); return; }
    const kind = svc.lastErrorKind;
    setProbeStatus(kind === 'cors' ? 'cors' : 'unreachable');
  }, []);

  useEffect(() => { probe(); }, [probe]);

  const isWebGPUSupported = typeof navigator !== 'undefined' && 'gpu' in navigator;

  return (
    <>
      <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm" onClick={onClose} />
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
        <div className="relative w-full max-w-2xl bg-white rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">

          {/* Header */}
          <div className="px-6 pt-6 pb-4 border-b border-slate-100 shrink-0"
            style={{ background: 'linear-gradient(135deg, #7c3aed10, #0d948810)' }}>
            <div className="flex items-center gap-2.5 mb-1">
              <div className="w-8 h-8 rounded-xl flex items-center justify-center shrink-0"
                style={{ background: 'linear-gradient(135deg, #7c3aed, #0d9488)' }}>
                <Sparkles size={15} className="text-white" />
              </div>
              <div>
                <h2 className="text-base font-bold text-slate-800">Meyvn AI Setup</h2>
                <p className="text-xs text-slate-500">Run AI locally — no data leaves your device</p>
              </div>
            </div>

            {/* Live connection status */}
            <div className="mt-3 flex items-center gap-2">
              {probeStatus === 'checking' && (
                <span className="flex items-center gap-1.5 text-[11px] text-slate-400">
                  <Loader2 size={10} className="animate-spin" /> Probing localhost:11434…
                </span>
              )}
              {probeStatus === 'ok' && (
                <span className="flex items-center gap-1.5 text-[11px] text-teal-600 font-medium">
                  <Wifi size={12} /> Ollama connected · localhost:11434
                </span>
              )}
              {probeStatus === 'cors' && (
                <span className="flex items-center gap-1.5 text-[11px] text-amber-600 font-medium">
                  <AlertCircle size={12} /> Ollama running but CORS is blocked — see step 3
                </span>
              )}
              {probeStatus === 'unreachable' && (
                <span className="flex items-center gap-1.5 text-[11px] text-slate-400">
                  <WifiOff size={12} /> Ollama not detected on localhost:11434
                </span>
              )}
              <button onClick={probe} title="Retry"
                className="ml-1 p-1 rounded-md text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-all">
                <RefreshCw size={11} />
              </button>
            </div>
          </div>

          {/* Tab switcher */}
          <div className="flex bg-slate-50 border-b border-slate-100 shrink-0">
            {(['guide', 'models'] as const).map((t) => (
              <button key={t} onClick={() => setTab(t)}
                className={`flex-1 py-3 text-xs font-semibold transition-all ${
                  tab === t
                    ? 'text-violet-700 border-b-2 border-violet-500 bg-white'
                    : 'text-slate-400 hover:text-slate-600'
                }`}>
                {t === 'guide' ? 'Setup Guide' : 'Model Catalogue'}
              </button>
            ))}
          </div>

          {/* Content */}
          <div className="flex-1 overflow-y-auto">

            {/* ── Setup Guide ── */}
            {tab === 'guide' && (
              <div className="px-6 py-5 space-y-6">

                {/* Ollama section */}
                <section>
                  <div className="flex items-center gap-2 mb-4">
                    <Cpu size={14} className="text-violet-500" />
                    <h3 className="text-sm font-bold text-slate-800">Option A — Ollama (recommended)</h3>
                    <span className="text-[9px] font-bold uppercase tracking-wide px-1.5 py-0.5 rounded bg-violet-100 text-violet-600">Qwen3 8B / 14B / 32B</span>
                  </div>
                  <div className="space-y-4">
                    <StepRow n={1}>
                      <p className="text-xs font-semibold text-slate-700">Download and install Ollama</p>
                      <p className="text-[11px] text-slate-500">
                        Visit <span className="font-mono text-violet-600">ollama.com</span> and download the installer for your OS (macOS, Windows, Linux).
                      </p>
                    </StepRow>
                    <StepRow n={2}>
                      <p className="text-xs font-semibold text-slate-700">Pull a Qwen3 model</p>
                      <p className="text-[11px] text-slate-500 mb-1.5">Start with 8B — it runs on most GPUs with 8 GB VRAM:</p>
                      <CodeBlock code="ollama pull qwen3:8b" />
                    </StepRow>
                    <StepRow n={3}>
                      <p className="text-xs font-semibold text-slate-700">Start Ollama with browser access</p>
                      <p className="text-[11px] text-slate-500 mb-1.5">
                        The browser needs CORS permission to reach localhost. Quit any running Ollama, then:
                      </p>
                      <CodeBlock code={'OLLAMA_ORIGINS="*" ollama serve'} />
                      <p className="text-[10px] text-slate-400 mt-1">
                        On Windows use: <span className="font-mono">set OLLAMA_ORIGINS=* && ollama serve</span>
                      </p>
                    </StepRow>
                    <StepRow n={4}>
                      <p className="text-xs font-semibold text-slate-700">Verify the connection</p>
                      <p className="text-[11px] text-slate-500">Click Retry above — the status should turn green. Then select your model in the Meyvn panel.</p>
                    </StepRow>
                  </div>
                </section>

                <div className="border-t border-slate-100" />

                {/* WebGPU section */}
                <section>
                  <div className="flex items-center gap-2 mb-4">
                    <Sparkles size={14} className="text-teal-500" />
                    <h3 className="text-sm font-bold text-slate-800">Option B — WebGPU (browser-only)</h3>
                    <span className="text-[9px] font-bold uppercase tracking-wide px-1.5 py-0.5 rounded bg-teal-100 text-teal-600">SmolLM2 1.7B · Qwen2.5 3B</span>
                  </div>
                  {!isWebGPUSupported ? (
                    <div className="flex items-start gap-2 p-3 rounded-xl bg-amber-50 border border-amber-200">
                      <AlertCircle size={13} className="text-amber-500 mt-0.5 shrink-0" />
                      <p className="text-[11px] text-amber-700">
                        WebGPU is not available in this browser. Use Chrome 113+ or Edge 113+ for WebGPU support.
                      </p>
                    </div>
                  ) : (
                    <div className="space-y-4">
                      <StepRow n={1}>
                        <p className="text-xs font-semibold text-slate-700">No install needed</p>
                        <p className="text-[11px] text-slate-500">
                          WebGPU models run directly in this browser tab using your GPU. No server, no downloads beyond the first load.
                        </p>
                      </StepRow>
                      <StepRow n={2}>
                        <p className="text-xs font-semibold text-slate-700">Select SmolLM2 · WebGPU in the Meyvn panel</p>
                        <p className="text-[11px] text-slate-500">
                          Click "Load" when prompted. Model weights (~900 MB for SmolLM2 1.7B, ~2.5 GB for Qwen2.5 3B) download once and are cached locally.
                        </p>
                      </StepRow>
                      <StepRow n={3}>
                        <p className="text-xs font-semibold text-slate-700">Browser requirements</p>
                        <ul className="text-[11px] text-slate-500 space-y-0.5 list-disc list-inside">
                          <li>Chrome 113+ or Edge 113+</li>
                          <li>GPU with WebGPU support (most 2019+ discrete GPUs)</li>
                          <li>1.5–3 GB available VRAM depending on the model</li>
                        </ul>
                      </StepRow>
                    </div>
                  )}
                </section>
              </div>
            )}

            {/* ── Model Catalogue ── */}
            {tab === 'models' && (
              <div className="px-6 py-5 space-y-6">

                {/* Ollama models */}
                <section>
                  <div className="flex items-center gap-2 mb-3">
                    <Cpu size={13} className="text-violet-500" />
                    <h3 className="text-xs font-bold text-slate-700 uppercase tracking-wide">Ollama Models</h3>
                  </div>
                  <div className="space-y-3">
                    {OLLAMA_CHAT_MODELS.map((m) => (
                      <div key={m.tag} className="rounded-xl border border-slate-200 overflow-hidden">
                        <div className="flex items-center gap-3 px-4 py-3 bg-slate-50">
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2">
                              <span className="text-sm font-bold text-slate-800">{m.label}</span>
                              {m.recommended && (
                                <span className="text-[9px] font-bold uppercase tracking-wide px-1.5 py-0.5 rounded bg-violet-100 text-violet-600">Recommended</span>
                              )}
                            </div>
                            <p className="text-[11px] text-slate-500 mt-0.5">{m.description}</p>
                          </div>
                          <div className="text-right shrink-0">
                            <p className="text-xs font-semibold text-slate-700">{m.vram}</p>
                            <p className="text-[10px] text-slate-400">VRAM</p>
                          </div>
                        </div>
                        <div className="px-4 py-2 bg-white">
                          <div className="relative">
                            <code className="block text-[11px] font-mono text-slate-600 pr-8 truncate">{m.pullCmd}</code>
                            <CopyButton text={m.pullCmd} />
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </section>

                {/* WebGPU models */}
                <section>
                  <div className="flex items-center gap-2 mb-3">
                    <Sparkles size={13} className="text-teal-500" />
                    <h3 className="text-xs font-bold text-slate-700 uppercase tracking-wide">WebGPU Models</h3>
                  </div>
                  <div className="space-y-3">
                    {WEB_LLM_MODELS.map((m) => (
                      <div key={m.id} className="rounded-xl border border-slate-200 overflow-hidden">
                        <div className="flex items-center gap-3 px-4 py-3 bg-slate-50">
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-bold text-slate-800">{m.label}</p>
                            <p className="text-[11px] text-slate-500 mt-0.5">{m.description}</p>
                          </div>
                          <div className="text-right shrink-0">
                            <p className="text-xs font-semibold text-slate-700">{m.vram}</p>
                            <p className="text-[10px] text-slate-400">VRAM</p>
                          </div>
                        </div>
                        <div className="px-4 py-2 bg-white">
                          <p className="text-[11px] text-slate-400 flex items-center gap-1">
                            <ChevronRight size={10} className="text-teal-400" />
                            Cached locally after first download — no re-download needed
                          </p>
                        </div>
                      </div>
                    ))}
                  </div>
                </section>
              </div>
            )}
          </div>

          {/* Footer */}
          <div className="px-6 py-4 border-t border-slate-100 shrink-0 flex items-center justify-between bg-slate-50">
            <p className="text-[10px] text-slate-400">All inference runs locally · No data sent to any server</p>
            <button onClick={onClose}
              className="px-4 py-2 rounded-xl text-xs font-semibold text-white transition-all"
              style={{ background: 'linear-gradient(135deg, #7c3aed, #0d9488)' }}>
              Done
            </button>
          </div>

          {/* Close button */}
          <button onClick={onClose}
            className="absolute top-4 right-4 flex items-center justify-center w-7 h-7 rounded-full text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-all">
            <X size={14} />
          </button>
        </div>
      </div>
    </>
  );
}
