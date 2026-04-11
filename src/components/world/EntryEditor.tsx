import { useCallback, useState } from 'react';
import { Tag, X } from 'lucide-react';
import { useWorldStore } from '../../store/worldStore';
import { RichTextEditor } from '../editor/RichTextEditor';
import { CustomFieldEditor } from './CustomFieldEditor';
import { EmptyState } from '../common/EmptyState';
import { BookOpen } from 'lucide-react';
import { useAutoSave } from '../../hooks/useAutoSave';

export function EntryEditor() {
  const entries = useWorldStore((s) => s.entries);
  const sections = useWorldStore((s) => s.sections);
  const activeEntryId = useWorldStore((s) => s.activeEntryId);
  const updateEntry = useWorldStore((s) => s.updateEntry);
  const addCustomField = useWorldStore((s) => s.addCustomField);
  const updateCustomField = useWorldStore((s) => s.updateCustomField);
  const deleteCustomField = useWorldStore((s) => s.deleteCustomField);

  const entry = entries.find((e) => e.id === activeEntryId);
  const section = entry ? sections.find((s) => s.id === entry.sectionId) : undefined;
  const [tagInput, setTagInput] = useState('');

  const saveContent = useCallback(
    async (content: string) => {
      if (entry) await updateEntry(entry.id, { content });
    },
    [entry, updateEntry]
  );

  const { save: debouncedSave } = useAutoSave(saveContent, 600);

  if (!entry) {
    return (
      <EmptyState
        icon={<BookOpen size={40} />}
        title="Select an entry"
        description="Choose an entry from the list or create a new one"
      />
    );
  }

  const handleAddTag = () => {
    const tag = tagInput.trim().toLowerCase();
    if (tag && !entry.tags.includes(tag)) {
      updateEntry(entry.id, { tags: [...entry.tags, tag] });
    }
    setTagInput('');
  };

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* ARCANUM EDITOR header */}
      <div className="px-5 pt-4 pb-3 border-b border-slate-200">
        {/* Header label */}
        <div className="arcanum-header mb-1.5">Arcanum Editor</div>

        {/* Breadcrumb */}
        {section && (
          <p className="text-[11px] text-slate-500 mb-3 tracking-wide">
            <span className="text-teal-600 uppercase text-[10px] font-semibold tracking-[0.1em]">
              {section.name}
            </span>
            <span className="mx-1.5 text-slate-400">–</span>
            <span className="text-slate-400">{entry.title || 'Untitled'}</span>
          </p>
        )}

        {/* Title input */}
        <input
          value={entry.title}
          onChange={(e) => updateEntry(entry.id, { title: e.target.value })}
          className="w-full bg-transparent text-xl font-semibold text-slate-900 placeholder-slate-400 focus:outline-none border-b border-transparent focus:border-violet-400 pb-1 transition-colors"
          placeholder="Entry title..."
        />

        {/* Tags */}
        <div className="flex flex-wrap items-center gap-1.5 mt-3">
          <Tag size={12} className="text-violet-400" />
          {entry.tags.map((tag) => (
            <span
              key={tag}
              className="flex items-center gap-1 text-xs bg-violet-100 text-violet-700 border border-violet-200 px-2 py-0.5 rounded-full"
            >
              {tag}
              <button
                onClick={() => updateEntry(entry.id, { tags: entry.tags.filter((t) => t !== tag) })}
                className="text-violet-400 hover:text-violet-600"
              >
                <X size={10} />
              </button>
            </span>
          ))}
          <input
            value={tagInput}
            onChange={(e) => setTagInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ',') { e.preventDefault(); handleAddTag(); }
            }}
            onBlur={handleAddTag}
            placeholder="Add tag..."
            className="text-xs bg-transparent text-slate-500 placeholder-slate-400 focus:outline-none w-20"
          />
        </div>
      </div>

      {/* Two-column: editor + custom fields */}
      <div className="flex flex-1 overflow-hidden">
        <div className="flex-1 overflow-hidden">
          <RichTextEditor
            key={entry.id}
            content={entry.content}
            onChange={debouncedSave}
            placeholder={`Describe this entry...`}
          />
        </div>

        {/* Custom fields panel */}
        <div className="w-64 shrink-0 border-l border-slate-200 overflow-y-auto p-3">
          <CustomFieldEditor
            fields={entry.customFields}
            onAdd={() => addCustomField(entry.id)}
            onChange={(fieldId, updates) => updateCustomField(entry.id, fieldId, updates)}
            onDelete={(fieldId) => deleteCustomField(entry.id, fieldId)}
          />
        </div>
      </div>
    </div>
  );
}
