import { useState, useRef, useEffect, useCallback } from 'react';
import { Send, Loader2, RotateCcw, MessageSquare } from 'lucide-react';
import { MarkdownText } from '../common/MarkdownText';
import { useSettingsStore, creativityToTemperature } from '../../store/settingsStore';
import { OllamaService, OLLAMA_DEFAULT_MODEL } from '../../features/ai-engine/services/OllamaService';
import { WebLLMService } from '../../features/ai-engine/services/WebLLMService';
import type { SketchpadEntry } from '../../types/sketchpad';

interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

const chatStorageKey = (entryId: string) => `scriptorium:chat:${entryId}`;

const SUGGESTIONS = [
  'How could I make this more surprising?',
  'What are the implications of this idea?',
  'Help me develop the motivation here',
];

function buildSystemPrompt(entry: SketchpadEntry, relatedIdeas: string[]): string {
  const lines = [
    `You are a creative writing mentor helping an author develop a story idea through conversation.`,
    ``,
    `The author is working on this idea:`,
    `Category: ${entry.category}`,
    `Idea: "${entry.content}"`,
  ];
  if (entry.tags.length > 0) lines.push(`Tags: ${entry.tags.join(', ')}`);
  if (relatedIdeas.length > 0) {
    lines.push(``, `Related ideas in their world:`, ...relatedIdeas.map((r) => `- ${r}`));
  }
  if (entry.aiAnalysis) {
    lines.push(``, `Previous AI analysis of this idea:`, entry.aiAnalysis);
  }
  lines.push(
    ``,
    `Help them explore, develop, challenge, and refine this idea through natural dialogue. Be specific, encouraging, and imaginative. Ask clarifying questions when helpful. Keep responses focused and not overly long.`,
  );
  return lines.join('\n');
}

interface Props {
  entry: SketchpadEntry;
  relatedIdeas: string[];
}

export function SketchpadChatPanel({ entry, relatedIdeas }: Props) {
  const saveAiConversations = useSettingsStore((s) => s.settings.saveAiConversations);
  const aiCreativity = useSettingsStore((s) => s.settings.aiCreativity);

  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [isStreaming, setIsStreaming] = useState(false);
  const [streamingContent, setStreamingContent] = useState('');
  const abortRef = useRef<AbortController | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  // Load/reset when entry changes
  useEffect(() => {
    abortRef.current?.abort();
    setIsStreaming(false);
    setStreamingContent('');
    setInput('');

    if (saveAiConversations) {
      try {
        const saved = localStorage.getItem(chatStorageKey(entry.id));
        setMessages(saved ? JSON.parse(saved) : []);
        return;
      } catch { /* ignore */ }
    }
    setMessages([]);
  }, [entry.id]); // eslint-disable-line react-hooks/exhaustive-deps

  // Persist when messages change
  useEffect(() => {
    if (!saveAiConversations || messages.length === 0) return;
    try {
      localStorage.setItem(chatStorageKey(entry.id), JSON.stringify(messages));
    } catch { /* ignore */ }
  }, [messages, entry.id, saveAiConversations]);

  // Auto-scroll to bottom
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, streamingContent]);

  const stop = useCallback(() => {
    abortRef.current?.abort();
    setIsStreaming(false);
    setStreamingContent('');
  }, []);

  const send = useCallback(async (text?: string) => {
    const content = (text ?? input).trim();
    if (!content || isStreaming) return;

    setInput('');
    const userMsg: ChatMessage = { role: 'user', content };
    const nextMessages = [...messages, userMsg];
    setMessages(nextMessages);
    setIsStreaming(true);
    setStreamingContent('');

    abortRef.current?.abort();
    const ctrl = new AbortController();
    abortRef.current = ctrl;

    const apiMessages = [
      { role: 'system' as const, content: buildSystemPrompt(entry, relatedIdeas) },
      ...nextMessages.map((m) => ({ role: m.role as 'user' | 'assistant', content: m.content })),
    ];

    const provider = localStorage.getItem('meyvn_provider') ?? 'ollama';

    try {
      let fullText = '';
      const onToken = (t: string) => { fullText += t; setStreamingContent(fullText); };
      const onDone = () => {
        setIsStreaming(false);
        setStreamingContent('');
        setMessages((prev) => [...prev, { role: 'assistant', content: fullText }]);
      };

      if (provider === 'webgpu') {
        if (!WebLLMService.isWebGPUSupported() || WebLLMService.status !== 'ready') {
          throw new Error('WebGPU model not ready. Load a model in the Meyvn panel first.');
        }
        await WebLLMService.chat({
          messages: apiMessages,
          temperature: creativityToTemperature(aiCreativity),
          onToken,
          onDone,
          signal: ctrl.signal,
        });
      } else {
        const modelId = localStorage.getItem('meyvn_ollama_model') ?? OLLAMA_DEFAULT_MODEL;
        const svc = new OllamaService();
        await svc.chat({
          model: modelId,
          messages: apiMessages,
          temperature: creativityToTemperature(aiCreativity),
          onToken,
          onDone,
          signal: ctrl.signal,
        });
      }
    } catch (err) {
      if (ctrl.signal.aborted) return;
      setIsStreaming(false);
      setStreamingContent('');
      setMessages((prev) => [
        ...prev,
        { role: 'assistant', content: `Error: ${err instanceof Error ? err.message : 'AI call failed'}` },
      ]);
    }
  }, [input, isStreaming, messages, entry, relatedIdeas, aiCreativity]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      send();
    }
  };

  const handleClear = () => {
    stop();
    setMessages([]);
    if (saveAiConversations) {
      try { localStorage.removeItem(chatStorageKey(entry.id)); } catch { /* ignore */ }
    }
  };

  const isEmpty = messages.length === 0 && !isStreaming;

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Sub-header */}
      <div className="flex items-center justify-between px-4 py-2 border-b border-slate-100 shrink-0">
        <div className="flex items-center gap-1.5">
          <MessageSquare size={11} className="text-violet-400" />
          <span className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider">
            Develop through dialogue
          </span>
        </div>
        {messages.length > 0 && (
          <button
            onClick={handleClear}
            className="flex items-center gap-1 text-[10px] text-slate-400 hover:text-slate-600 transition-colors"
          >
            <RotateCcw size={9} />
            Clear
          </button>
        )}
      </div>

      {/* Message list */}
      <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3">
        {isEmpty && (
          <div className="flex flex-col items-center justify-center gap-3 py-6">
            <div
              className="w-10 h-10 rounded-2xl flex items-center justify-center"
              style={{ background: 'linear-gradient(135deg, #7c3aed18, #0d948818)' }}
            >
              <MessageSquare size={18} className="text-violet-400" />
            </div>
            <div className="text-center">
              <p className="text-xs font-medium text-slate-500">Start a conversation</p>
              <p className="text-[10px] text-slate-400 mt-0.5 leading-relaxed">
                Ask questions, explore possibilities,<br />or iterate on this idea with AI
              </p>
            </div>
            <div className="flex flex-col gap-1.5 w-full">
              {SUGGESTIONS.map((s) => (
                <button
                  key={s}
                  onClick={() => { setInput(s); inputRef.current?.focus(); }}
                  className="text-[10px] text-slate-500 hover:text-violet-600 text-left px-3 py-1.5 rounded-lg bg-slate-50 hover:bg-violet-50 border border-slate-200 hover:border-violet-200 transition-all"
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
        )}

        {messages.map((msg, i) => (
          <div key={i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
            <div
              className={`max-w-[88%] px-3 py-2 rounded-2xl text-xs leading-relaxed break-words ${
                msg.role === 'user'
                  ? 'text-white rounded-br-sm whitespace-pre-wrap'
                  : 'bg-white border border-slate-200 text-slate-700 rounded-bl-sm shadow-sm'
              }`}
              style={msg.role === 'user' ? { background: 'linear-gradient(135deg, #7c3aed, #0d9488)' } : undefined}
            >
              {msg.role === 'assistant'
                ? <MarkdownText content={msg.content} />
                : msg.content
              }
            </div>
          </div>
        ))}

        {/* Streaming bubble */}
        {isStreaming && (
          <div className="flex justify-start">
            <div className="max-w-[88%] px-3 py-2 rounded-2xl rounded-bl-sm text-xs leading-relaxed bg-white border border-slate-200 text-slate-700 shadow-sm break-words">
              {streamingContent ? (
                <>
                  <MarkdownText content={streamingContent} />
                  <span className="inline-block w-1 h-3 bg-violet-400 animate-pulse rounded-sm ml-0.5 align-middle" />
                </>
              ) : (
                <span className="flex items-center gap-1.5 text-slate-400">
                  <Loader2 size={10} className="animate-spin" />
                  Thinking…
                </span>
              )}
            </div>
          </div>
        )}

        <div ref={bottomRef} />
      </div>

      {/* Input area */}
      <div className="px-3 pt-2 pb-3 border-t border-slate-100 shrink-0">
        {isStreaming && (
          <button
            onClick={stop}
            className="flex items-center gap-1.5 w-full justify-center py-1.5 mb-2 rounded-xl text-[11px] font-semibold text-slate-600 bg-slate-100 hover:bg-slate-200 transition-all"
          >
            Stop
          </button>
        )}
        <div className="flex gap-2 items-end">
          <textarea
            ref={inputRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Ask about this idea…"
            rows={2}
            className="flex-1 text-xs bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 focus:outline-none focus:border-violet-300 focus:ring-2 focus:ring-violet-100 resize-none placeholder:text-slate-400 text-slate-700 leading-relaxed"
          />
          <button
            onClick={() => send()}
            disabled={!input.trim() || isStreaming}
            className="flex items-center justify-center w-8 h-8 rounded-xl transition-all disabled:opacity-40 shrink-0 mb-0.5"
            style={{ background: 'linear-gradient(135deg, #7c3aed, #0d9488)' }}
            title="Send (Enter)"
          >
            {isStreaming
              ? <Loader2 size={12} className="text-white animate-spin" />
              : <Send size={12} className="text-white" />
            }
          </button>
        </div>
        <p className="text-[9px] text-slate-400 mt-1 text-center">Enter to send · Shift+Enter for newline</p>
      </div>
    </div>
  );
}
