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
  const activeEntryId = useWorldStore((s) => s.activeEntryId);
  const updateEntry = useWorldStore((s) => s.updateEntry);
  const addCustomField = useWorldStore((s) => s.addCustomField);
  const updateCustomField = useWorldStore((s) => s.updateCustomField);
  const deleteCustomField = useWorldStore((s) => s.deleteCustomField);

  const entry = entries.find((e) => e.id === activeEntryId);
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
      {/* Entry header */}
      <div className="p-4 border-b border-slate-700/50 space-y-3">
        <input
          value={entry.title}
          onChange={(e) => updateEntry(entry.id, { title: e.target.value })}
          className="w-full bg-transparent text-xl font-semibold text-slate-100 placeholder-slate-600 focus:outline-none border-b border-transparent focus:border-indigo-500 pb-1 transition-colors"
          placeholder="Entry title..."
        />

        {/* Tags */}
        <div className="flex flex-wrap items-center gap-1.5">
          <Tag size={12} className="text-slate-500" />
          {entry.tags.map((tag) => (
            <span key={tag} className="flex items-center gap-1 text-xs bg-slate-700 text-slate-300 px-2 py-0.5 rounded-full">
              {tag}
              <button onClick={() => updateEntry(entry.id, { tags: entry.tags.filter((t) => t !== tag) })} className="text-slate-500 hover:text-slate-300">
                <X size={10} />
              </button>
            </span>
          ))}
          <input
            value={tagInput}
            onChange={(e) => setTagInput(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ',') { e.preventDefault(); handleAddTag(); } }}
            onBlur={handleAddTag}
            placeholder="Add tag..."
            className="text-xs bg-transparent text-slate-400 placeholder-slate-600 focus:outline-none w-20"
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
        <div className="w-64 shrink-0 border-l border-slate-700/50 overflow-y-auto p-3">
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
