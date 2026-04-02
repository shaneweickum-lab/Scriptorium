import { ManuscriptBuilder } from './ManuscriptBuilder';
import { ManuscriptPreview } from './ManuscriptPreview';

export function Assembly() {
  return (
    <div className="flex h-full">
      {/* Builder panel */}
      <div className="w-72 shrink-0 border-r border-slate-700/50 bg-slate-900/50">
        <ManuscriptBuilder />
      </div>
      {/* Preview panel */}
      <div className="flex-1 bg-slate-900/10 overflow-hidden">
        <ManuscriptPreview />
      </div>
    </div>
  );
}
