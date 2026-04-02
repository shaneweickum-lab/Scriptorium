import { Plus, Trash2 } from 'lucide-react';
import type { CustomField } from '../../types';

interface Props {
  fields: CustomField[];
  onAdd: () => void;
  onChange: (fieldId: string, updates: Partial<CustomField>) => void;
  onDelete: (fieldId: string) => void;
}

export function CustomFieldEditor({ fields, onAdd, onChange, onDelete }: Props) {
  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Custom Fields</span>
        <button
          onClick={onAdd}
          className="flex items-center gap-1 text-xs text-indigo-400 hover:text-indigo-300 transition-colors"
        >
          <Plus size={12} />
          Add Field
        </button>
      </div>
      <div className="space-y-2">
        {fields.map((field) => (
          <div key={field.id} className="flex items-start gap-2">
            <div className="flex flex-col gap-1 flex-1 min-w-0">
              <input
                value={field.label}
                onChange={(e) => onChange(field.id, { label: e.target.value })}
                placeholder="Field name"
                className="bg-slate-900 border border-slate-700 rounded px-2 py-1 text-xs text-slate-400 focus:outline-none focus:ring-1 focus:ring-indigo-500 w-full"
              />
              <select
                value={field.fieldType}
                onChange={(e) => onChange(field.id, { fieldType: e.target.value as CustomField['fieldType'] })}
                className="bg-slate-900 border border-slate-700 rounded px-2 py-1 text-xs text-slate-400 focus:outline-none"
              >
                <option value="text">Text</option>
                <option value="textarea">Long Text</option>
                <option value="number">Number</option>
                <option value="date">Date</option>
              </select>
              {field.fieldType === 'textarea' ? (
                <textarea
                  value={field.value}
                  onChange={(e) => onChange(field.id, { value: e.target.value })}
                  placeholder="Value..."
                  rows={3}
                  className="bg-slate-800 border border-slate-700 rounded px-2 py-1 text-sm text-slate-300 placeholder-slate-600 focus:outline-none focus:ring-1 focus:ring-indigo-500 resize-y"
                />
              ) : (
                <input
                  type={field.fieldType === 'number' ? 'number' : field.fieldType === 'date' ? 'date' : 'text'}
                  value={field.value}
                  onChange={(e) => onChange(field.id, { value: e.target.value })}
                  placeholder="Value..."
                  className="bg-slate-800 border border-slate-700 rounded px-2 py-1 text-sm text-slate-300 placeholder-slate-600 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                />
              )}
            </div>
            <button
              onClick={() => onDelete(field.id)}
              className="mt-1 p-1.5 rounded hover:bg-red-900/40 text-red-400 transition-colors"
              title="Delete field"
            >
              <Trash2 size={14} />
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
