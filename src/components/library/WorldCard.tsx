import { useState } from 'react';
import { MoreVertical, Pencil, Trash2, Globe2 } from 'lucide-react';
import type { WorldBible } from '../../types';
import { ConfirmDialog } from '../common/ConfirmDialog';

interface Props {
  world: WorldBible;
  onOpen: (id: string) => void;
  onDelete: (id: string) => void;
  onEdit: (world: WorldBible) => void;
}

function formatDate(ts: number): string {
  return new Date(ts).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}

export function WorldCard({ world, onOpen, onDelete, onEdit }: Props) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  return (
    <>
      <div
        className="group relative bg-slate-800 rounded-xl border border-slate-700/50 hover:border-slate-600 transition-all cursor-pointer overflow-hidden hover:shadow-xl hover:shadow-black/30 hover:-translate-y-0.5"
        onClick={() => onOpen(world.id)}
      >
        {/* Colored top accent */}
        <div className="h-1.5 w-full" style={{ backgroundColor: world.coverColor }} />

        <div className="p-5">
          {/* Icon + name */}
          <div className="flex items-start gap-2 mb-2">
            <div
              className="w-7 h-7 rounded-lg flex items-center justify-center shrink-0 mt-0.5"
              style={{ backgroundColor: world.coverColor + '30', color: world.coverColor }}
            >
              <Globe2 size={15} />
            </div>
            <h3 className="text-lg font-bold text-slate-100 leading-tight line-clamp-2">
              {world.name}
            </h3>
          </div>

          {/* Description */}
          {world.description && (
            <p className="text-xs text-slate-500 line-clamp-2 mb-3 leading-relaxed">
              {world.description}
            </p>
          )}

          {/* Footer */}
          <div className="flex items-center justify-between mt-auto pt-3 border-t border-slate-700/50">
            <span className="text-xs text-slate-600">Updated {formatDate(world.updatedAt)}</span>
            <span
              className="flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full"
              style={{ backgroundColor: world.coverColor + '25', color: world.coverColor }}
            >
              <Globe2 size={10} />
              Edit World
            </span>
          </div>
        </div>

        {/* Kebab menu */}
        <div
          className="absolute top-3 right-3 opacity-0 group-hover:opacity-100 transition-opacity"
          onClick={(e) => e.stopPropagation()}
        >
          <button
            onClick={() => setMenuOpen(!menuOpen)}
            className="p-1.5 rounded-lg bg-slate-700/80 text-slate-400 hover:text-slate-200 transition-colors"
          >
            <MoreVertical size={14} />
          </button>
          {menuOpen && (
            <>
              <div className="fixed inset-0 z-10" onClick={() => setMenuOpen(false)} />
              <div className="absolute right-0 top-8 z-20 bg-slate-800 border border-slate-700 rounded-lg shadow-xl min-w-32 py-1">
                <button
                  onClick={() => { setMenuOpen(false); onEdit(world); }}
                  className="flex items-center gap-2 w-full px-3 py-2 text-sm text-slate-300 hover:bg-slate-700 transition-colors"
                >
                  <Pencil size={13} />
                  Edit
                </button>
                <button
                  onClick={() => { setMenuOpen(false); setConfirmDelete(true); }}
                  className="flex items-center gap-2 w-full px-3 py-2 text-sm text-red-400 hover:bg-red-900/30 transition-colors"
                >
                  <Trash2 size={13} />
                  Delete
                </button>
              </div>
            </>
          )}
        </div>
      </div>

      {confirmDelete && (
        <ConfirmDialog
          title="Delete World"
          message={`Delete "${world.name}" and all its entries? Books linked to this world will be unlinked. This cannot be undone.`}
          confirmLabel="Delete"
          danger
          onConfirm={() => onDelete(world.id)}
          onClose={() => setConfirmDelete(false)}
        />
      )}
    </>
  );
}
