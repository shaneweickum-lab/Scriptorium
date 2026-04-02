import { useAssemblyStore } from '../../store/assemblyStore';
import { useWritingStore } from '../../store/writingStore';
import { useLibraryStore } from '../../store/libraryStore';
import { tiptapJsonToHtml } from '../../utils/tiptapToHtml';

export function ManuscriptPreview() {
  const assembly = useAssemblyStore((s) => s.assembly);
  const nodes = useWritingStore((s) => s.nodes);
  const activeBook = useLibraryStore((s) => s.activeBook);

  const items = [...(assembly?.items || [])].sort((a, b) => a.order - b.order);
  const nodeMap = new Map(nodes.map((n) => [n.id, n]));

  return (
    <div className="flex-1 overflow-y-auto h-full">
      <div className="max-w-2xl mx-auto px-8 py-12">
        {/* Title page */}
        <div className="text-center mb-16">
          <h1 className="text-4xl font-bold font-prose text-slate-100 mb-3">
            {activeBook?.title || 'Untitled'}
          </h1>
          {activeBook?.author && (
            <p className="text-slate-400 font-prose text-lg">{activeBook.author}</p>
          )}
        </div>

        {items.length === 0 && (
          <p className="text-slate-600 text-center text-sm">
            Add content in the builder panel to see your manuscript here.
          </p>
        )}

        {items.map((item) => {
          if (item.type === 'break') {
            return (
              <div key={item.id} className="text-center my-8 text-slate-500 text-lg tracking-widest">
                {item.content || '* * *'}
              </div>
            );
          }
          if (item.type === 'frontmatter') {
            return (
              <div key={item.id} className="mb-8">
                {item.customTitle && (
                  <h2 className="text-xl font-semibold font-prose text-slate-200 mb-4">{item.customTitle}</h2>
                )}
                {item.content && (
                  <div
                    className="prose prose-invert prose-slate max-w-none font-prose"
                    dangerouslySetInnerHTML={{ __html: tiptapJsonToHtml(item.content) }}
                  />
                )}
              </div>
            );
          }
          if (!item.nodeId) return null;
          const node = nodeMap.get(item.nodeId);
          if (!node) return null;
          const html = tiptapJsonToHtml(node.content);

          return (
            <div key={item.id} className="mb-12">
              <h2 className="text-2xl font-bold font-prose text-slate-200 mb-6 pb-2 border-b border-slate-700/50">
                {node.title}
              </h2>
              {html ? (
                <div
                  className="prose prose-invert prose-slate max-w-none font-prose prose-p:leading-relaxed"
                  dangerouslySetInnerHTML={{ __html: html }}
                />
              ) : (
                <p className="text-slate-600 text-sm italic">[No content]</p>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
