import type { Assembly, WritingNode, ProjectMeta } from '../../types';
import { tiptapJsonToHtml } from '../../utils/tiptapToHtml';

export function exportHtml(
  assembly: Assembly,
  nodeMap: Map<string, WritingNode>,
  projectMeta: ProjectMeta | null
): void {
  const items = [...assembly.items].sort((a, b) => a.order - b.order);
  const title = projectMeta?.title || 'Untitled';
  const author = projectMeta?.author || '';

  let body = '';

  for (const item of items) {
    if (item.type === 'break') {
      body += `<div class="break">${item.content || '* * *'}</div>\n`;
      continue;
    }
    if (item.type === 'frontmatter') {
      if (item.customTitle) body += `<h2>${item.customTitle}</h2>\n`;
      if (item.content) body += tiptapJsonToHtml(item.content) + '\n';
      continue;
    }
    if (!item.nodeId) continue;
    const node = nodeMap.get(item.nodeId);
    if (!node) continue;
    body += `<h2 class="chapter-title">${node.title}</h2>\n`;
    body += tiptapJsonToHtml(node.content) + '\n';
  }

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${title}</title>
<style>
  *, *::before, *::after { box-sizing: border-box; }
  body {
    font-family: Georgia, Cambria, serif;
    font-size: 1.05rem;
    line-height: 1.8;
    color: #1a1a2e;
    background: #fafaf8;
    max-width: 680px;
    margin: 0 auto;
    padding: 4rem 2rem;
  }
  h1 { font-size: 2.5rem; text-align: center; margin-bottom: 0.5rem; }
  .author { text-align: center; font-size: 1.1rem; color: #555; margin-bottom: 4rem; }
  h2.chapter-title { font-size: 1.8rem; margin-top: 4rem; margin-bottom: 1.5rem; padding-bottom: 0.5rem; border-bottom: 1px solid #ddd; }
  p { margin: 0 0 1rem; text-indent: 1.5em; }
  p:first-of-type, h2 + p { text-indent: 0; }
  blockquote { border-left: 3px solid #ccc; padding-left: 1rem; font-style: italic; color: #555; margin: 1.5rem 0; }
  .break { text-align: center; margin: 3rem 0; font-size: 1.2rem; letter-spacing: 0.5em; color: #888; }
  ul, ol { padding-left: 1.5rem; margin: 1rem 0; }
  li { margin: 0.25rem 0; }
  mark { background: rgba(255, 220, 0, 0.4); }
  @media print {
    body { background: white; max-width: 100%; padding: 1in; }
  }
</style>
</head>
<body>
  <h1>${title}</h1>
  ${author ? `<p class="author">by ${author}</p>` : ''}
  ${body}
</body>
</html>`;

  const blob = new Blob([html], { type: 'text/html;charset=utf-8' });
  triggerDownload(blob, `${slugify(title)}.html`);
}

function slugify(str: string): string {
  return str.replace(/[^a-z0-9]/gi, '-').toLowerCase().replace(/-+/g, '-').replace(/^-|-$/g, '') || 'manuscript';
}

function triggerDownload(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
