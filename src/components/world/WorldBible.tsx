import { SectionList } from './SectionList';
import { EntryList } from './EntryList';
import { EntryEditor } from './EntryEditor';

export function WorldBible() {
  return (
    <div className="flex h-full">
      {/* Section list */}
      <div className="w-44 shrink-0 border-r border-slate-700/50 bg-slate-900/50">
        <SectionList />
      </div>
      {/* Entry list */}
      <div className="w-60 shrink-0 border-r border-slate-700/50 bg-slate-900/30">
        <EntryList />
      </div>
      {/* Entry editor */}
      <div className="flex-1 bg-slate-900/20">
        <EntryEditor />
      </div>
    </div>
  );
}
