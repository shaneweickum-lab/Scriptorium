import { useEffect, useState } from 'react';
import {
  X, Settings, ChevronRight, ChevronLeft,
  Globe, Palette, PenLine, Brain, Cpu, Network, Shield, Database,
} from 'lucide-react';
import { GeneralSection } from './sections/GeneralSection';
import { AppearanceSection } from './sections/AppearanceSection';
import { EditorSection } from './sections/EditorSection';
import { AISection } from './sections/AISection';
import { ModelsSection } from './sections/ModelsSection';
import { ContextSection } from './sections/ContextSection';
import { PrivacySection } from './sections/PrivacySection';
import { DataSection } from './sections/DataSection';

// ---------------------------------------------------------------------------
// Navigation definition
// ---------------------------------------------------------------------------

export type SettingsSection =
  | 'general' | 'appearance' | 'editor' | 'ai'
  | 'models' | 'context' | 'privacy' | 'data';

interface NavItem {
  id: SettingsSection;
  label: string;
  icon: typeof Globe;
  description: string;
}

const NAV_ITEMS: NavItem[] = [
  { id: 'general',    label: 'General',    icon: Globe,    description: 'Startup, confirmations' },
  { id: 'appearance', label: 'Appearance', icon: Palette,  description: 'Theme, density, motion' },
  { id: 'editor',     label: 'Editor',     icon: PenLine,  description: 'Font, size, line height' },
  { id: 'ai',         label: 'AI',         icon: Brain,    description: 'Creativity, initiative' },
  { id: 'models',     label: 'Models',     icon: Cpu,      description: 'Ollama, WebGPU, URLs' },
  { id: 'context',    label: 'Context',    icon: Network,  description: 'Memory & retrieval' },
  { id: 'privacy',    label: 'Privacy',    icon: Shield,   description: 'Local-first, data use' },
  { id: 'data',       label: 'Data',       icon: Database, description: 'Export, import, reset' },
];

// ---------------------------------------------------------------------------
// Section renderer
// ---------------------------------------------------------------------------

function SectionContent({ section }: { section: SettingsSection }) {
  switch (section) {
    case 'general':    return <GeneralSection />;
    case 'appearance': return <AppearanceSection />;
    case 'editor':     return <EditorSection />;
    case 'ai':         return <AISection />;
    case 'models':     return <ModelsSection />;
    case 'context':    return <ContextSection />;
    case 'privacy':    return <PrivacySection />;
    case 'data':       return <DataSection />;
  }
}

// ---------------------------------------------------------------------------
// SettingsModal
// ---------------------------------------------------------------------------

interface SettingsModalProps {
  onClose: () => void;
  initialSection?: SettingsSection;
}

export function SettingsModal({ onClose, initialSection = 'general' }: SettingsModalProps) {
  const [activeSection, setActiveSection] = useState<SettingsSection>(initialSection);
  const [mobileView, setMobileView] = useState<'nav' | 'section'>('nav');

  // Escape key handler
  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [onClose]);

  // Listen for the custom event from GeneralSection's project-settings button
  useEffect(() => {
    const handler = () => onClose();
    window.addEventListener('open-project-settings', handler);
    return () => window.removeEventListener('open-project-settings', handler);
  }, [onClose]);

  const handleSelectSection = (id: SettingsSection) => {
    setActiveSection(id);
    setMobileView('section');
  };

  const activeItem = NAV_ITEMS.find((n) => n.id === activeSection)!;

  return (
    <div className="fixed inset-0 z-50 flex items-end md:items-center justify-center md:p-4">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm wp-modal-backdrop-enter"
        onClick={onClose}
      />

      {/* Dialog */}
      <div className="relative w-full md:max-w-4xl bg-white border border-slate-200 shadow-2xl rounded-t-2xl md:rounded-2xl h-[92vh] md:h-[85vh] flex flex-col overflow-hidden wp-modal-dialog-enter">

        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100 shrink-0">
          <div className="flex items-center gap-2">
            {/* Mobile: back button when in section view */}
            {mobileView === 'section' && (
              <button
                onClick={() => setMobileView('nav')}
                className="md:hidden p-1.5 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 mr-1"
              >
                <ChevronLeft size={16} />
              </button>
            )}
            <div
              className="w-6 h-6 rounded-lg flex items-center justify-center shrink-0"
              style={{ background: 'linear-gradient(135deg, #7c3aed, #0d9488)' }}
            >
              <Settings size={12} className="text-white" />
            </div>
            <h2 className="text-base font-semibold text-slate-800">
              {mobileView === 'section' ? activeItem.label : 'Settings'}
            </h2>
          </div>
          <button
            onClick={onClose}
            aria-label="Close settings"
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors"
          >
            <X size={16} />
          </button>
        </div>

        {/* Body */}
        <div className="flex flex-1 min-h-0 overflow-hidden">

          {/* Left navigation — desktop always visible; mobile visible when mobileView=nav */}
          <aside
            className={`
              flex-col shrink-0 border-r border-slate-100 overflow-y-auto
              w-full md:w-52
              ${mobileView === 'nav' ? 'flex' : 'hidden md:flex'}
            `}
          >
            <nav className="p-2 space-y-0.5">
              {NAV_ITEMS.map(({ id, label, icon: Icon, description }) => (
                <button
                  key={id}
                  onClick={() => handleSelectSection(id)}
                  className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-left transition-all group ${
                    activeSection === id
                      ? 'bg-violet-50 text-violet-700'
                      : 'text-slate-600 hover:bg-slate-50 hover:text-slate-800'
                  }`}
                >
                  <Icon
                    size={15}
                    className={activeSection === id ? 'text-violet-600' : 'text-slate-400 group-hover:text-slate-600'}
                  />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium leading-none">{label}</p>
                    <p className="text-[10px] text-slate-400 mt-0.5 leading-none">{description}</p>
                  </div>
                  <ChevronRight size={12} className="text-slate-300 shrink-0 md:hidden" />
                </button>
              ))}
            </nav>

            {/* Global indicator */}
            <div className="mt-auto px-3 py-4 border-t border-slate-100">
              <div className="flex items-center gap-1.5 text-[10px] text-slate-400">
                <div className="w-1.5 h-1.5 rounded-full bg-teal-400" />
                Global preferences
              </div>
              <p className="text-[9px] text-slate-300 mt-0.5 leading-relaxed">
                These settings apply across all worlds. Per-project settings live in Project Settings.
              </p>
            </div>
          </aside>

          {/* Right content — desktop always visible; mobile visible when mobileView=section */}
          <main
            className={`
              flex-1 overflow-y-auto p-5 md:p-6
              ${mobileView === 'section' ? 'block' : 'hidden md:block'}
            `}
          >
            <SectionContent section={activeSection} />
          </main>
        </div>
      </div>
    </div>
  );
}
