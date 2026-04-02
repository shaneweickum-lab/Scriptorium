import { useState } from 'react';
import { FileText, BookOpen, FileCode, Loader } from 'lucide-react';
import { Modal } from '../common/Modal';
import { Button } from '../common/Button';
import { useAssemblyStore } from '../../store/assemblyStore';
import { useWritingStore } from '../../store/writingStore';
import { useUIStore } from '../../store/uiStore';
import { useLibraryStore } from '../../store/libraryStore';
import { exportHtml } from './exportHtml';
import { exportEpub } from './exportEpub';
import { exportDocx } from './exportDocx';

type Format = 'html' | 'epub' | 'docx';

const FORMATS: { id: Format; label: string; desc: string; icon: typeof FileText }[] = [
  { id: 'html', label: 'HTML', desc: 'Standalone webpage, great for sharing', icon: FileCode },
  { id: 'epub', label: 'EPUB', desc: 'E-reader format (Kindle, Calibre, etc.)', icon: BookOpen },
  { id: 'docx', label: 'Word Document', desc: 'Compatible with Microsoft Word & LibreOffice', icon: FileText },
];

interface Props { onClose: () => void }

export function ExportModal({ onClose }: Props) {
  const assembly = useAssemblyStore((s) => s.assembly);
  const nodes = useWritingStore((s) => s.nodes);
  const activeBook = useLibraryStore((s) => s.activeBook);
  const addToast = useUIStore((s) => s.addToast);
  const [selected, setSelected] = useState<Format>('html');
  const [exporting, setExporting] = useState(false);

  const nodeMap = new Map(nodes.map((n) => [n.id, n]));

  const handleExport = async () => {
    if (!assembly) {
      addToast('No assembly found', 'error');
      return;
    }
    setExporting(true);
    try {
      if (selected === 'html') {
        exportHtml(assembly, nodeMap, activeBook);
      } else if (selected === 'epub') {
        await exportEpub(assembly, nodeMap, activeBook);
      } else if (selected === 'docx') {
        await exportDocx(assembly, nodeMap, activeBook);
      }
      addToast(`Exported as ${selected.toUpperCase()}`);
      onClose();
    } catch (e) {
      addToast(`Export failed: ${e instanceof Error ? e.message : 'Unknown error'}`, 'error');
    } finally {
      setExporting(false);
    }
  };

  return (
    <Modal title="Export Manuscript" onClose={onClose} size="md">
      <div className="space-y-3 mb-6">
        {FORMATS.map((fmt) => {
          const Icon = fmt.icon;
          return (
            <button
              key={fmt.id}
              onClick={() => setSelected(fmt.id)}
              className={`w-full flex items-center gap-3 p-3 rounded-xl border transition-all text-left ${
                selected === fmt.id
                  ? 'border-indigo-500 bg-indigo-900/20 text-slate-200'
                  : 'border-slate-700 hover:border-slate-500 text-slate-400'
              }`}
            >
              <Icon size={20} className={selected === fmt.id ? 'text-indigo-400' : 'text-slate-500'} />
              <div>
                <div className="font-medium text-sm">{fmt.label}</div>
                <div className="text-xs text-slate-500">{fmt.desc}</div>
              </div>
            </button>
          );
        })}
      </div>

      {assembly && (
        <p className="text-xs text-slate-500 mb-4">
          {assembly.items.length} item(s) in assembly · {activeBook?.title || 'Untitled'}
        </p>
      )}

      <div className="flex justify-end gap-3">
        <Button variant="ghost" onClick={onClose}>Cancel</Button>
        <Button variant="primary" onClick={handleExport} disabled={exporting || !assembly}>
          {exporting ? (
            <><Loader size={14} className="animate-spin" /> Exporting...</>
          ) : (
            `Export ${selected.toUpperCase()}`
          )}
        </Button>
      </div>
    </Modal>
  );
}
