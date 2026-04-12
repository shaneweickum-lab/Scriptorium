import { ManuscriptBuilder } from './ManuscriptBuilder';
import { ManuscriptPreview } from './ManuscriptPreview';

export function Assembly() {
  return (
    <div className="flex h-full">
      {/* Builder panel */}
      <div className="w-72 shrink-0 border-r border-slate-200 bg-white">
        <ManuscriptBuilder />
      </div>
      {/* Preview panel */}
      <div className="flex-1 bg-slate-50 overflow-hidden">
        <ManuscriptPreview />
      </div>
    </div>
  );
}
