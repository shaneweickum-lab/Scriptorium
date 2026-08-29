/**
 * StructureAssistantPanel — slide-in drawer for AI-powered structure analysis.
 *
 * Triggered from the NodeEditor header. Analyzes scene or chapter structure
 * using the active AI provider (Ollama or WebGPU) and streams supportive,
 * mentor-voiced feedback covering opening hook, pacing, transitions, and
 * narrative coherence.
 */

import { useEffect, useRef, useState, useCallback } from 'react';
import { X, Sparkles, RefreshCw, Loader2, AlertCircle, Wifi } from 'lucide-react';
import { useWritingStore } from '../../store/writingStore';
import { useEditorStore } from '../../store/editorStore';
import { OllamaService, OLLAMA_DEFAULT_MODEL } from '../../features/ai-engine/services/OllamaService';
import { WebLLMService } from '../../features/ai-engine/services/WebLLMService';
import { StructureAnalysisService } from '../../features/ai-engine/services/StructureAnalysisService';
import { tiptapJsonToText } from '../../utils/tiptapToHtml';
import type { WritingNode } from '../../types';

interface StructureAssistantPanelProps {
  node: WritingNode;
  onClose: () => void;
}

// ---------------------------------------------------------------------------
// Markdown-ish renderer — handles **bold** headers inline
// ---------------------------------------------------------------------------

function renderAnalysis(text: string) {
  const lines = text.split('\n');
  return lines.map((line, i) => {
    // Bold header: **Some Header**
    const headerMatch = line.match(/^\*\*(.+?)\*\*(.*)$/);
    if (headerMatch) {
      return (
        <p key={i} className="mt-4 first:mt-0">
          <strong className="text-slate-800 font-semibold">{headerMatch[1]}</strong>
          {headerMatch[2] && <span className="text-slate-600">{headerMatch[2]}</span>}
        </p>
      );
    }
    if (line.trim() === '') return <div key={i} className="h-1" />;
    return <p key={i} className="text-slate-600 text-sm leading-relaxed">{line}</p>;
  });
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function StructureAssistantPanel({ node, onClose }: StructureAssistantPanelProps) {
  const nodes = useWritingStore((s) => s.nodes);
  const liveContent = useEditorStore((s) => s.liveContent);

  const [streamedText, setStreamedText] = useState('');
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const getContent = useCallback((): {
    messages: ReturnType<typeof StructureAnalysisService.buildSceneMessages>;
    sceneCount?: number;
  } => {
    if (node.type === 'chapter') {
      const scenes = nodes
        .filter((n) => n.parentId === node.id && n.type === 'scene')
        .sort((a, b) => a.order - b.order);

      const sceneTexts = scenes.map((s) => ({
        title: s.title || 'Untitled',
        content: tiptapJsonToText(s.content ?? ''),
      }));

      // If chapter has no scenes or they're all empty, fall back to live content
      const totalChars = sceneTexts.reduce((sum, s) => sum + s.content.length, 0);
      if (totalChars === 0) {
        return {
          messages: StructureAnalysisService.buildSceneMessages({
            title: node.title || 'Untitled',
            content: liveContent || '(no content yet)',
          }),
        };
      }

      return {
        messages: StructureAnalysisService.buildChapterMessages({
          title: node.title || 'Untitled',
          sceneTexts,
        }),
        sceneCount: scenes.length,
      };
    }

    // Scene / note — use live content (most up-to-date)
    return {
      messages: StructureAnalysisService.buildSceneMessages({
        title: node.title || 'Untitled',
        content: liveContent || tiptapJsonToText(node.content ?? '') || '(no content yet)',
      }),
    };
  }, [node, nodes, liveContent]);

  const runAnalysis = useCallback(async () => {
    abortRef.current?.abort();
    const ctrl = new AbortController();
    abortRef.current = ctrl;

    setIsAnalyzing(true);
    setStreamedText('');
    setError(null);

    const { messages } = getContent();
    const provider = localStorage.getItem('meyvn_provider') ?? 'ollama';

    try {
      if (provider === 'webgpu') {
        if (!WebLLMService.isWebGPUSupported()) {
          throw new Error('WebGPU is not supported in this browser.');
        }
        if (WebLLMService.status !== 'ready') {
          throw new Error('WebGPU model is not loaded. Open the Meyvn panel and load a model first.');
        }
        await WebLLMService.chat({
          messages,
          temperature: 0.55,
          onToken: (t) => setStreamedText((s) => s + t),
          onDone: () => setIsAnalyzing(false),
          signal: ctrl.signal,
        });
      } else {
        const modelId = localStorage.getItem('meyvn_ollama_model') ?? OLLAMA_DEFAULT_MODEL;
        const svc = new OllamaService();
        await svc.chat({
          model: modelId,
          messages,
          temperature: 0.55,
          onToken: (t) => setStreamedText((s) => s + t),
          onDone: () => setIsAnalyzing(false),
          signal: ctrl.signal,
        });
      }
    } catch (err) {
      if (ctrl.signal.aborted) return;
      const msg = err instanceof Error ? err.message : 'Analysis failed';
      setError(msg);
      setIsAnalyzing(false);
    }
  }, [getContent]);

  // Auto-run on mount
  useEffect(() => {
    runAnalysis();
    return () => { abortRef.current?.abort(); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const typeLabel = node.type === 'chapter' ? 'Chapter' : 'Scene';
  const { sceneCount } = node.type === 'chapter' ? getContent() : {};

  return (
    <div className="flex flex-col h-full w-72 shrink-0 border-l border-slate-200 bg-white overflow-hidden">
      {/* Header */}
      <div
        className="px-4 pt-4 pb-3 border-b border-slate-100 shrink-0"
        style={{ background: 'linear-gradient(135deg, #7c3aed0d, #0d94880d)' }}
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div
              className="w-6 h-6 rounded-lg flex items-center justify-center shrink-0"
              style={{ background: 'linear-gradient(135deg, #7c3aed, #0d9488)' }}
            >
              <Sparkles size={12} className="text-white" />
            </div>
            <div>
              <p className="text-xs font-bold text-slate-800">Structure Assistant</p>
              <p className="text-[10px] text-slate-400">
                {typeLabel}: {node.title || 'Untitled'}
                {sceneCount !== undefined && ` · ${sceneCount} scene${sceneCount !== 1 ? 's' : ''}`}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors"
          >
            <X size={13} />
          </button>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto px-4 py-4 text-sm">
        {error ? (
          <div className="flex flex-col items-start gap-3">
            <div className="flex items-start gap-2 p-3 rounded-xl bg-amber-50 border border-amber-200 w-full">
              <AlertCircle size={13} className="text-amber-500 mt-0.5 shrink-0" />
              <div>
                <p className="text-[11px] font-semibold text-amber-700 mb-0.5">Could not connect</p>
                <p className="text-[11px] text-amber-600 leading-relaxed">{error}</p>
              </div>
            </div>
            <div className="flex items-start gap-2 p-3 rounded-xl bg-slate-50 border border-slate-200 w-full">
              <Wifi size={12} className="text-slate-400 mt-0.5 shrink-0" />
              <p className="text-[11px] text-slate-500 leading-relaxed">
                Make sure Ollama is running with{' '}
                <span className="font-mono text-violet-600">OLLAMA_ORIGINS="*" ollama serve</span>,
                or load a WebGPU model in the Meyvn panel.
              </p>
            </div>
          </div>
        ) : streamedText ? (
          <div className="space-y-0.5">
            {renderAnalysis(streamedText)}
            {isAnalyzing && (
              <span className="inline-block w-1.5 h-4 bg-violet-400 animate-pulse rounded-sm ml-0.5 align-middle" />
            )}
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center h-24 gap-3 text-slate-400">
            <Loader2 size={20} className="animate-spin text-violet-400" />
            <p className="text-xs">Analyzing your {typeLabel.toLowerCase()}…</p>
          </div>
        )}
      </div>

      {/* Footer */}
      {!isAnalyzing && (streamedText || error) && (
        <div className="px-4 pb-4 pt-2 border-t border-slate-100 shrink-0">
          <button
            onClick={runAnalysis}
            className="flex items-center gap-1.5 w-full justify-center py-2 rounded-xl text-xs font-semibold text-white transition-all"
            style={{ background: 'linear-gradient(135deg, #7c3aed, #0d9488)' }}
          >
            <RefreshCw size={11} />
            Re-analyze
          </button>
        </div>
      )}
      {isAnalyzing && streamedText && (
        <div className="px-4 pb-4 pt-2 border-t border-slate-100 shrink-0">
          <button
            onClick={() => { abortRef.current?.abort(); setIsAnalyzing(false); }}
            className="flex items-center gap-1.5 w-full justify-center py-2 rounded-xl text-xs font-semibold text-slate-600 bg-slate-100 hover:bg-slate-200 transition-all"
          >
            Stop
          </button>
        </div>
      )}
    </div>
  );
}
