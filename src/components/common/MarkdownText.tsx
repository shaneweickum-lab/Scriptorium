import type { ReactNode } from 'react';

// ---------------------------------------------------------------------------
// Inline parser — bold, italic, bold+italic, inline code
// ---------------------------------------------------------------------------

function parseInline(text: string, keyPrefix: string): ReactNode[] {
  // Order matters: *** before ** before *
  const re = /`([^`]+)`|\*\*\*([^*]+)\*\*\*|\*\*([^*]+)\*\*|\*([^*\n]+)\*|_([^_\n]+)_/g;
  const nodes: ReactNode[] = [];
  let last = 0;
  let k = 0;
  let m: RegExpExecArray | null;

  while ((m = re.exec(text)) !== null) {
    if (m.index > last) nodes.push(text.slice(last, m.index));
    const key = `${keyPrefix}-${k++}`;
    if (m[1] !== undefined) {
      // Inline code
      nodes.push(
        <code key={key} className="font-mono bg-black/[0.06] px-1 py-px rounded text-[0.9em]">
          {m[1]}
        </code>,
      );
    } else if (m[2] !== undefined) {
      nodes.push(<strong key={key}><em>{m[2]}</em></strong>);
    } else if (m[3] !== undefined) {
      nodes.push(<strong key={key}>{m[3]}</strong>);
    } else {
      nodes.push(<em key={key}>{m[4] ?? m[5]}</em>);
    }
    last = m.index + m[0].length;
  }
  if (last < text.length) nodes.push(text.slice(last));
  return nodes;
}

// ---------------------------------------------------------------------------
// Block parser
// ---------------------------------------------------------------------------

type Block =
  | { type: 'h1' | 'h2' | 'h3'; text: string }
  | { type: 'bullet' | 'numbered'; items: string[] }
  | { type: 'para'; text: string }
  | { type: 'spacer' };

function parseBlocks(markdown: string): Block[] {
  const lines = markdown.split('\n');
  const out: Block[] = [];
  let listType: 'bullet' | 'numbered' | null = null;
  let listItems: string[] = [];

  const flushList = () => {
    if (listType && listItems.length) {
      out.push({ type: listType, items: [...listItems] });
      listType = null;
      listItems = [];
    }
  };

  for (const rawLine of lines) {
    const line = rawLine;
    const h3m = line.match(/^###\s+(.*)/);
    const h2m = line.match(/^##\s+(.*)/);
    const h1m = line.match(/^#\s+(.*)/);
    const bm = line.match(/^[-*]\s+(.*)/);
    const nm = line.match(/^\d+\.\s+(.*)/);

    if (h3m || h2m || h1m) {
      flushList();
      const match = (h3m ?? h2m ?? h1m)!;
      out.push({ type: h3m ? 'h3' : h2m ? 'h2' : 'h1', text: match[1] });
    } else if (bm) {
      if (listType !== 'bullet') { flushList(); listType = 'bullet'; }
      listItems.push(bm[1]);
    } else if (nm) {
      if (listType !== 'numbered') { flushList(); listType = 'numbered'; }
      listItems.push(nm[1]);
    } else if (line.trim() === '') {
      flushList();
      out.push({ type: 'spacer' });
    } else {
      flushList();
      out.push({ type: 'para', text: line });
    }
  }
  flushList();

  // Collapse consecutive spacers and strip leading/trailing spacers
  return out
    .filter((b, i) => !(b.type === 'spacer' && out[i - 1]?.type === 'spacer'))
    .filter((b, i, arr) => !(b.type === 'spacer' && (i === 0 || i === arr.length - 1)));
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

interface Props {
  content: string;
  /** Extra classes on the wrapper div — use to set text size/colour. */
  className?: string;
}

/**
 * Renders AI output as formatted markdown.
 * Colour and font-size are inherited from the parent; set them via `className`
 * or a wrapper element so this component works in any bubble or panel.
 */
export function MarkdownText({ content, className = '' }: Props) {
  const blocks = parseBlocks(content);

  return (
    <div className={className}>
      {blocks.map((block, i) => {
        switch (block.type) {
          case 'h1':
            return (
              <p key={i} className="font-bold text-[1.05em] mt-3 mb-0.5 first:mt-0">
                {parseInline(block.text, `${i}`)}
              </p>
            );
          case 'h2':
            return (
              <p key={i} className="font-semibold mt-2.5 mb-0.5 first:mt-0">
                {parseInline(block.text, `${i}`)}
              </p>
            );
          case 'h3':
            return (
              <p key={i} className="font-semibold text-[0.9em] uppercase tracking-wide mt-2 mb-0.5 first:mt-0 opacity-70">
                {parseInline(block.text, `${i}`)}
              </p>
            );
          case 'bullet':
            return (
              <ul key={i} className="list-disc list-outside pl-4 space-y-0.5 my-1.5 first:mt-0">
                {block.items.map((item, j) => (
                  <li key={j} className="leading-relaxed">
                    {parseInline(item, `${i}-${j}`)}
                  </li>
                ))}
              </ul>
            );
          case 'numbered':
            return (
              <ol key={i} className="list-decimal list-outside pl-4 space-y-0.5 my-1.5 first:mt-0">
                {block.items.map((item, j) => (
                  <li key={j} className="leading-relaxed">
                    {parseInline(item, `${i}-${j}`)}
                  </li>
                ))}
              </ol>
            );
          case 'spacer':
            return <div key={i} className="h-1.5" />;
          case 'para':
          default:
            return (
              <p key={i} className="leading-relaxed mt-1.5 first:mt-0">
                {parseInline(block.text, `${i}`)}
              </p>
            );
        }
      })}
    </div>
  );
}
