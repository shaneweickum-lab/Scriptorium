import { useState, useEffect } from 'react';
import { FileText, BookOpen, FileCode, Loader, BookMarked, Info } from 'lucide-react';
import { Modal } from '../common/Modal';
import { Button } from '../common/Button';
import { useAssemblyStore } from '../../store/assemblyStore';
import { useWritingStore } from '../../store/writingStore';
import { useUIStore } from '../../store/uiStore';
import { useLibraryStore } from '../../store/libraryStore';
import { exportHtml } from './exportHtml';
import { exportEpub } from './exportEpub';
import { exportDocx } from './exportDocx';
import { exportDocxKdp } from './exportDocxKdp';
import type { KdpExportOptions } from './exportDocxKdp';

type Format = 'html' | 'epub' | 'docx' | 'docx-kdp';

const FORMATS: { id: Format; label: string; desc: string; icon: typeof FileText }[] = [
  { id: 'html', label: 'HTML', desc: 'Standalone webpage, great for sharing', icon: FileCode },
  { id: 'epub', label: 'EPUB', desc: 'E-reader format (Kindle, Calibre, etc.)', icon: BookOpen },
  { id: 'docx', label: 'Word Document', desc: 'Compatible with Microsoft Word & LibreOffice', icon: FileText },
  { id: 'docx-kdp', label: 'Word (KDP)', desc: 'Formatted for Amazon KDP publishing — headers, margins, TOC', icon: BookMarked },
];

const PAGE_SIZES = [
  { label: '6" × 9" (Standard)', w: 6, h: 9 },
  { label: '5" × 8"', w: 5, h: 8 },
  { label: '5.5" × 8.5"', w: 5.5, h: 8.5 },
  { label: '5.06" × 7.81"', w: 5.06, h: 7.81 },
  { label: '6.14" × 9.21"', w: 6.14, h: 9.21 },
  { label: '8.5" × 11" (Large)', w: 8.5, h: 11 },
];

type PageCountRange = KdpExportOptions['pageCountRange'];

const PAGE_COUNT_RANGES: { value: PageCountRange; label: string; gutter: string }[] = [
  { value: '24-150',   label: '24 – 150 pages',   gutter: '0.375"' },
  { value: '151-300',  label: '151 – 300 pages',  gutter: '0.5"' },
  { value: '301-500',  label: '301 – 500 pages',  gutter: '0.625"' },
  { value: '501-700',  label: '501 – 700 pages',  gutter: '0.75"' },
  { value: '701-828',  label: '701 – 828 pages',  gutter: '0.875"' },
];

const WORDS_PER_PAGE = 280;

function estimatePageRange(wordCount: number): PageCountRange {
  const pages = Math.max(24, Math.ceil(wordCount / WORDS_PER_PAGE));
  if (pages <= 150) return '24-150';
  if (pages <= 300) return '151-300';
  if (pages <= 500) return '301-500';
  if (pages <= 700) return '501-700';
  return '701-828';
}

interface Props { onClose: () => void }

export function ExportModal({ onClose }: Props) {
  const assembly = useAssemblyStore((s) => s.assembly);
  const nodes = useWritingStore((s) => s.nodes);
  const activeBook = useLibraryStore((s) => s.activeBook);
  const addToast = useUIStore((s) => s.addToast);
  const [selected, setSelected] = useState<Format>('html');
  const [exporting, setExporting] = useState(false);

  // KDP settings
  const [kdpPageSize, setKdpPageSize] = useState({ w: 6, h: 9 });
  const [kdpPageRange, setKdpPageRange] = useState<PageCountRange>('151-300');
  const [kdpDedication, setKdpDedication] = useState('');
  const [kdpChapterOwn, setKdpChapterOwn] = useState(true);

  const nodeMap = new Map(nodes.map((n) => [n.id, n]));

  // Auto-estimate page count range from word count
  useEffect(() => {
    if (!assembly) return;
    let totalWords = 0;
    for (const item of assembly.items) {
      if (item.nodeId) {
        const node = nodeMap.get(item.nodeId);
        if (node) totalWords += node.wordCountCache || 0;
      }
    }
    setKdpPageRange(estimatePageRange(totalWords));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [assembly]);

  const selectedRangeEntry = PAGE_COUNT_RANGES.find((r) => r.value === kdpPageRange);

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
      } else if (selected === 'docx-kdp') {
        await exportDocxKdp(assembly, nodeMap, activeBook, {
          pageWidthIn: kdpPageSize.w,
          pageHeightIn: kdpPageSize.h,
          pageCountRange: kdpPageRange,
          dedication: kdpDedication,
          chapterTitlesOnOwnPage: kdpChapterOwn,
        });
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
      <div className="space-y-3 mb-4">
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

      {/* KDP Settings panel */}
      {selected === 'docx-kdp' && (
        <div className="mb-4 rounded-xl border border-violet-700/50 bg-slate-800/60 p-4 space-y-4">
          <p className="text-xs font-semibold uppercase tracking-widest text-violet-400">
            KDP Publishing Settings
          </p>

          {/* Page Size */}
          <div>
            <label className="block text-xs text-slate-400 mb-1">Page Size</label>
            <select
              value={`${kdpPageSize.w}x${kdpPageSize.h}`}
              onChange={(e) => {
                const found = PAGE_SIZES.find((s) => `${s.w}x${s.h}` === e.target.value);
                if (found) setKdpPageSize({ w: found.w, h: found.h });
              }}
              className="w-full rounded-lg bg-slate-700 border border-slate-600 text-slate-200 text-sm px-3 py-2 focus:outline-none focus:border-indigo-500"
            >
              {PAGE_SIZES.map((s) => (
                <option key={`${s.w}x${s.h}`} value={`${s.w}x${s.h}`}>
                  {s.label}
                </option>
              ))}
            </select>
          </div>

          {/* Estimated Page Count */}
          <div>
            <label className="block text-xs text-slate-400 mb-1">Estimated Page Count</label>
            <select
              value={kdpPageRange}
              onChange={(e) => setKdpPageRange(e.target.value as PageCountRange)}
              className="w-full rounded-lg bg-slate-700 border border-slate-600 text-slate-200 text-sm px-3 py-2 focus:outline-none focus:border-indigo-500"
            >
              {PAGE_COUNT_RANGES.map((r) => (
                <option key={r.value} value={r.value}>
                  {r.label} ({r.gutter} gutter)
                </option>
              ))}
            </select>
            {selectedRangeEntry && (
              <p className="text-xs text-slate-500 mt-1">
                Gutter margin: {selectedRangeEntry.gutter} inside / 0.25" outside
              </p>
            )}
          </div>

          {/* Dedication */}
          <div>
            <label className="block text-xs text-slate-400 mb-1">Dedication (optional)</label>
            <textarea
              value={kdpDedication}
              onChange={(e) => setKdpDedication(e.target.value)}
              placeholder="For..."
              rows={2}
              className="w-full rounded-lg bg-slate-700 border border-slate-600 text-slate-200 text-sm px-3 py-2 focus:outline-none focus:border-indigo-500 resize-none placeholder:text-slate-600"
            />
          </div>

          {/* Chapter on own page */}
          <label className="flex items-center gap-2 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={kdpChapterOwn}
              onChange={(e) => setKdpChapterOwn(e.target.checked)}
              className="rounded border-slate-600 bg-slate-700 text-indigo-500 focus:ring-indigo-500 focus:ring-offset-slate-900"
            />
            <span className="text-sm text-slate-300">Start each chapter on a new page</span>
          </label>

          {/* Info note */}
          <div className="flex gap-2 text-xs text-slate-500">
            <Info size={14} className="shrink-0 mt-0.5 text-indigo-400" />
            <span>
              The table of contents will auto-update when opened in Microsoft Word
              (right-click TOC → Update Field).
            </span>
          </div>
        </div>
      )}

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
