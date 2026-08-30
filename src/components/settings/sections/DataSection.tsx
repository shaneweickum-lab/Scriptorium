import { useState } from 'react';
import { Download, Upload, Trash2, RefreshCcw, Database } from 'lucide-react';
import { useSettingsStore } from '../../../store/settingsStore';
import { useLibraryStore } from '../../../store/libraryStore';
import { useUIStore } from '../../../store/uiStore';
import { useProject } from '../../../hooks/useProject';
import { SectionHeader, DangerZone, SettingGroup, SettingRow, InfoBanner } from '../SettingsPrimitives';
import { DEFAULT_EDITOR_SETTINGS, editorSettingsStore } from '../../../store/editorSettingsStore';
import { db } from '../../../db/database';

export function DataSection() {
  const resetAll = useSettingsStore((s) => s.resetAll);
  const activeBook = useLibraryStore((s) => s.activeBook);
  const setShowExportModal = useUIStore((s) => s.setShowExportModal);
  const { saveProject, loadProject } = useProject();

  const [clearing, setClearing] = useState(false);
  const [cleared, setCleared] = useState('');

  const clearAIHistory = () => {
    if (!confirm('Clear all saved Meyvn AI conversations? This cannot be undone.')) return;
    const keysToRemove: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k?.startsWith('meyvn_hist_')) keysToRemove.push(k);
    }
    keysToRemove.forEach((k) => localStorage.removeItem(k));
    setCleared('AI history cleared.');
    setTimeout(() => setCleared(''), 3000);
  };

  const clearStyleProfiles = () => {
    if (!confirm('Clear all style and Oracle profiles? They will be re-generated when you next write.')) return;
    const keysToRemove: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k?.startsWith('scriptorium:style:') || k?.startsWith('scriptorium:oracle:')) {
        keysToRemove.push(k);
      }
    }
    keysToRemove.forEach((k) => localStorage.removeItem(k));
    setCleared('Style and Oracle profiles cleared.');
    setTimeout(() => setCleared(''), 3000);
  };

  const resetEditorPrefs = () => {
    if (!confirm('Reset editor settings to defaults?')) return;
    editorSettingsStore.set(DEFAULT_EDITOR_SETTINGS);
    setCleared('Editor settings reset.');
    setTimeout(() => setCleared(''), 3000);
  };

  const resetAllPrefs = () => {
    if (!confirm('Reset all global preferences to defaults? Your worlds and content are not affected.')) return;
    resetAll();
    setCleared('All preferences reset to defaults.');
    setTimeout(() => setCleared(''), 3000);
  };

  const handleImport = () => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json';
    input.onchange = (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (file) loadProject(file);
    };
    input.click();
  };

  const clearSketchpad = async () => {
    if (!activeBook) return;
    if (!confirm('Delete all Sketchpad entries for this project? This cannot be undone.')) return;
    setClearing(true);
    await db.sketchpadEntries.where('bookId').equals(activeBook.id).delete();
    setClearing(false);
    setCleared('Sketchpad entries deleted.');
    setTimeout(() => setCleared(''), 3000);
  };

  return (
    <div>
      <SectionHeader title="Data" description="Manage, export, and reset your writing data" />

      <div className="space-y-4">
        {cleared && (
          <InfoBanner>✓ {cleared}</InfoBanner>
        )}

        <SettingGroup title="Export & Backup">
          <SettingRow
            label="Export manuscript"
            description="Export as HTML, EPUB, DOCX, or KDP-ready Word document"
            control={
              <button
                onClick={() => setShowExportModal(true)}
                className="flex items-center gap-1.5 text-xs font-medium text-violet-600 hover:text-violet-700 px-3 py-1.5 rounded-lg bg-violet-50 hover:bg-violet-100 transition-colors"
              >
                <Download size={11} />
                Export
              </button>
            }
          />
          <SettingRow
            label="Save project as JSON"
            description="Full backup including all nodes, world entries, and assembly"
            control={
              <button
                onClick={saveProject}
                className="flex items-center gap-1.5 text-xs font-medium text-slate-600 hover:text-slate-700 px-3 py-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 transition-colors"
              >
                <Download size={11} />
                Save JSON
              </button>
            }
          />
          <SettingRow
            label="Restore from JSON"
            description="Import a previously saved project file"
            control={
              <button
                onClick={handleImport}
                className="flex items-center gap-1.5 text-xs font-medium text-slate-600 hover:text-slate-700 px-3 py-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 transition-colors"
              >
                <Upload size={11} />
                Import
              </button>
            }
          />
        </SettingGroup>

        <SettingGroup title="Reset Preferences">
          <SettingRow
            label="Reset editor settings"
            description="Font, size, line height, and width back to defaults"
            control={
              <button onClick={resetEditorPrefs} className="flex items-center gap-1.5 text-xs font-medium text-slate-500 hover:text-slate-700 px-3 py-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 transition-colors">
                <RefreshCcw size={11} />
                Reset
              </button>
            }
          />
          <SettingRow
            label="Reset AI history"
            description="Clear all saved Meyvn conversations from localStorage"
            control={
              <button onClick={clearAIHistory} className="flex items-center gap-1.5 text-xs font-medium text-slate-500 hover:text-slate-700 px-3 py-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 transition-colors">
                <RefreshCcw size={11} />
                Clear
              </button>
            }
          />
          <SettingRow
            label="Reset style profiles"
            description="Clear Oracle and style analysis data. Re-generated automatically."
            control={
              <button onClick={clearStyleProfiles} className="flex items-center gap-1.5 text-xs font-medium text-slate-500 hover:text-slate-700 px-3 py-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 transition-colors">
                <RefreshCcw size={11} />
                Clear
              </button>
            }
          />
          <SettingRow
            label="Reset all preferences"
            description="Reset every global setting to its default. Does not delete any world content."
            control={
              <button onClick={resetAllPrefs} className="flex items-center gap-1.5 text-xs font-medium text-slate-500 hover:text-slate-700 px-3 py-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 transition-colors">
                <RefreshCcw size={11} />
                Reset all
              </button>
            }
          />
        </SettingGroup>

        <DangerZone>
          {activeBook && (
            <SettingRow
              label="Delete Sketchpad entries"
              description={`Permanently delete all Sketchpad ideas for "${activeBook.title}"`}
              control={
                <button
                  onClick={clearSketchpad}
                  disabled={clearing}
                  className="flex items-center gap-1.5 text-xs font-medium text-red-500 hover:text-red-600 px-3 py-1.5 rounded-lg bg-red-50 hover:bg-red-100 transition-colors disabled:opacity-50"
                >
                  <Trash2 size={11} />
                  Delete
                </button>
              }
            />
          )}
          <SettingRow
            label="Storage location"
            description="All data lives in your browser's IndexedDB. Clear site data in browser settings to remove everything."
            control={
              <span className="flex items-center gap-1 text-xs text-slate-400">
                <Database size={11} />
                IndexedDB
              </span>
            }
          />
        </DangerZone>
      </div>
    </div>
  );
}
