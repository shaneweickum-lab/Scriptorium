import { X, Tag } from 'lucide-react';
import type { WorldEntry, WorldSection } from '../../types';
import { tiptapJsonToText } from '../../utils/tiptapToHtml';

interface Props {
  entry: WorldEntry;
  section: WorldSection | undefined;
  onClose: () => void;
}

export function WorldReferencePanel({ entry, section, onClose }: Props) {
  const contentText = tiptapJsonToText(entry.content);

  return (
    <div className="flex flex-col h-full border-l border-slate-200 bg-white w-72 shrink-0">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-slate-200">
        <div className="min-w-0">
          <p className="text-[10px] text-teal-600 uppercase tracking-wider font-semibold mb-0.5">
            {section?.name ?? 'World Bible'}
          </p>
          <h3 className="text-sm font-semibold text-slate-800 truncate">{entry.title}</h3>
        </div>
        <button
          onClick={onClose}
          className="shrink-0 ml-2 p-1 rounded text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors"
          title="Close"
        >
          <X size={14} />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {/* Tags */}
        {entry.tags.length > 0 && (
          <div className="flex flex-wrap items-center gap-1.5">
            <Tag size={11} className="text-slate-400 shrink-0" />
            {entry.tags.map((tag) => (
              <span
                key={tag}
                className="text-[10px] bg-violet-100 text-violet-600 px-1.5 py-0.5 rounded"
              >
                {tag}
              </span>
            ))}
          </div>
        )}

        {/* Content */}
        {contentText ? (
          <div>
            <p className="text-[10px] text-teal-600 uppercase tracking-wider font-semibold mb-1.5">
              Notes
            </p>
            <p className="text-xs text-slate-700 leading-relaxed whitespace-pre-wrap">
              {contentText}
            </p>
          </div>
        ) : (
          <p className="text-xs text-slate-400 italic">No notes written yet.</p>
        )}

        {/* Custom Fields */}
        {entry.customFields.length > 0 && (
          <div>
            <p className="text-[10px] text-teal-600 uppercase tracking-wider font-semibold mb-2">
              Details
            </p>
            <div className="space-y-2">
              {entry.customFields.map((field) => (
                <div key={field.id}>
                  <p className="text-[10px] text-slate-500 uppercase tracking-wider mb-0.5">
                    {field.label}
                  </p>
                  <p className="text-xs text-slate-700 leading-relaxed">
                    {field.value || <span className="italic text-slate-400">—</span>}
                  </p>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
