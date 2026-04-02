import JSZip from 'jszip';
import type { Assembly, WritingNode, Book } from '../../types';
import { tiptapJsonToHtml } from '../../utils/tiptapToHtml';

function slugify(str: string): string {
  return str.replace(/[^a-z0-9]/gi, '-').toLowerCase().replace(/-+/g, '-').replace(/^-|-$/g, '') || 'untitled';
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

function chapterXhtml(title: string, bodyHtml: string): string {
  return `<?xml version="1.0" encoding="utf-8"?>
<!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml" xml:lang="en">
<head>
  <meta charset="utf-8" />
  <title>${title}</title>
  <link rel="stylesheet" type="text/css" href="../styles/style.css"/>
</head>
<body>
  <h1>${title}</h1>
  ${bodyHtml || '<p></p>'}
</body>
</html>`;
}

interface Chapter { id: string; title: string; bodyHtml: string }

export async function exportEpub(
  assembly: Assembly,
  nodeMap: Map<string, WritingNode>,
  projectMeta: Book | null
): Promise<void> {
  const title = projectMeta?.title || 'Untitled';
  const author = projectMeta?.author || 'Unknown Author';
  const bookId = crypto.randomUUID();

  const items = [...assembly.items].sort((a, b) => a.order - b.order);

  const chapters: Chapter[] = [];
  for (const item of items) {
    if (item.type === 'break') continue;
    if (item.type === 'frontmatter') {
      chapters.push({ id: `ch-${item.id}`, title: item.customTitle || 'Front Matter', bodyHtml: tiptapJsonToHtml(item.content || '') });
      continue;
    }
    if (!item.nodeId) continue;
    const node = nodeMap.get(item.nodeId);
    if (!node) continue;
    chapters.push({ id: `ch-${item.id}`, title: node.title, bodyHtml: tiptapJsonToHtml(node.content) });
  }

  const zip = new JSZip();

  zip.file('mimetype', 'application/epub+zip', { compression: 'STORE' });

  zip.file('META-INF/container.xml', `<?xml version="1.0"?>
<container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container">
  <rootfiles>
    <rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/>
  </rootfiles>
</container>`);

  zip.file('OEBPS/styles/style.css', `
body { font-family: Georgia, serif; font-size: 1em; line-height: 1.7; margin: 1em 2em; color: #111; }
h1 { font-size: 1.6em; margin-top: 2em; margin-bottom: 0.8em; }
p { margin: 0 0 0.8em; text-indent: 1.4em; }
p:first-of-type { text-indent: 0; }
blockquote { border-left: 2px solid #ccc; padding-left: 1em; font-style: italic; }
`);

  for (const ch of chapters) {
    zip.file(`OEBPS/chapters/${ch.id}.xhtml`, chapterXhtml(ch.title, ch.bodyHtml));
  }

  const manifestItems = [
    `    <item id="ncx" href="toc.ncx" media-type="application/x-dtbncx+xml"/>`,
    `    <item id="nav" href="nav.xhtml" media-type="application/xhtml+xml" properties="nav"/>`,
    `    <item id="css" href="styles/style.css" media-type="text/css"/>`,
    ...chapters.map((ch) => `    <item id="${ch.id}" href="chapters/${ch.id}.xhtml" media-type="application/xhtml+xml"/>`),
  ].join('\n');
  const spineItems = chapters.map((ch) => `    <itemref idref="${ch.id}"/>`).join('\n');

  zip.file('OEBPS/content.opf', `<?xml version="1.0" encoding="utf-8"?>
<package xmlns="http://www.idpf.org/2007/opf" version="3.0" unique-identifier="bookid">
  <metadata xmlns:dc="http://purl.org/dc/elements/1.1/">
    <dc:title>${title}</dc:title>
    <dc:creator>${author}</dc:creator>
    <dc:language>en</dc:language>
    <dc:identifier id="bookid">urn:uuid:${bookId}</dc:identifier>
    <meta property="dcterms:modified">${new Date().toISOString().split('.')[0]}Z</meta>
  </metadata>
  <manifest>
${manifestItems}
  </manifest>
  <spine toc="ncx">
${spineItems}
  </spine>
</package>`);

  const navItems = chapters.map((ch) => `    <li><a href="chapters/${ch.id}.xhtml">${ch.title}</a></li>`).join('\n');
  zip.file('OEBPS/nav.xhtml', `<?xml version="1.0" encoding="utf-8"?>
<!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops" xml:lang="en">
<head><meta charset="utf-8"/><title>Table of Contents</title></head>
<body>
  <nav epub:type="toc">
    <h1>Table of Contents</h1>
    <ol>
${navItems}
    </ol>
  </nav>
</body>
</html>`);

  const ncxItems = chapters.map((ch, i) => `  <navPoint id="np-${i}" playOrder="${i + 1}">
    <navLabel><text>${ch.title}</text></navLabel>
    <content src="chapters/${ch.id}.xhtml"/>
  </navPoint>`).join('\n');

  zip.file('OEBPS/toc.ncx', `<?xml version="1.0" encoding="utf-8"?>
<ncx xmlns="http://www.daisy.org/z3986/2005/ncx/" version="2005-1">
  <head>
    <meta name="dtb:uid" content="urn:uuid:${bookId}"/>
    <meta name="dtb:depth" content="1"/>
    <meta name="dtb:totalPageCount" content="0"/>
    <meta name="dtb:maxPageNumber" content="0"/>
  </head>
  <docTitle><text>${title}</text></docTitle>
  <navMap>
${ncxItems}
  </navMap>
</ncx>`);

  const blob = await zip.generateAsync({ type: 'blob', mimeType: 'application/epub+zip' });
  triggerDownload(blob, `${slugify(title)}.epub`);
}
