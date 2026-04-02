import {
  Document, Packer, Paragraph, TextRun, HeadingLevel,
  AlignmentType,
} from 'docx';
import type { Assembly, WritingNode, ProjectMeta } from '../../types';
import { tiptapJsonToDocxParagraphs } from '../../utils/tiptapToDocx';

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

function slugify(str: string): string {
  return str.replace(/[^a-z0-9]/gi, '-').toLowerCase().replace(/-+/g, '-').replace(/^-|-$/g, '') || 'manuscript';
}

export async function exportDocx(
  assembly: Assembly,
  nodeMap: Map<string, WritingNode>,
  projectMeta: ProjectMeta | null
): Promise<void> {
  const title = projectMeta?.title || 'Untitled';
  const author = projectMeta?.author || '';

  const allParagraphs: Paragraph[] = [];

  allParagraphs.push(
    new Paragraph({
      children: [new TextRun({ text: title, bold: true, size: 64 })],
      heading: HeadingLevel.TITLE,
      alignment: AlignmentType.CENTER,
      spacing: { before: 4000, after: 400 },
    })
  );
  if (author) {
    allParagraphs.push(
      new Paragraph({
        children: [new TextRun({ text: author, size: 28 })],
        alignment: AlignmentType.CENTER,
        spacing: { after: 4000 },
      })
    );
  }

  const items = [...assembly.items].sort((a, b) => a.order - b.order);

  for (const item of items) {
    if (item.type === 'break') {
      allParagraphs.push(
        new Paragraph({
          children: [new TextRun(item.content || '* * *')],
          alignment: AlignmentType.CENTER,
          spacing: { before: 400, after: 400 },
        })
      );
      continue;
    }
    if (item.type === 'frontmatter') {
      if (item.customTitle) {
        allParagraphs.push(
          new Paragraph({
            children: [new TextRun({ text: item.customTitle, bold: true })],
            heading: HeadingLevel.HEADING_1,
            pageBreakBefore: true,
          })
        );
      }
      if (item.content) {
        allParagraphs.push(...tiptapJsonToDocxParagraphs(item.content));
      }
      continue;
    }
    if (!item.nodeId) continue;
    const node = nodeMap.get(item.nodeId);
    if (!node) continue;

    allParagraphs.push(
      new Paragraph({
        children: [new TextRun({ text: node.title, bold: true })],
        heading: HeadingLevel.HEADING_1,
        pageBreakBefore: allParagraphs.length > 2,
        spacing: { before: 200, after: 400 },
      })
    );

    if (node.content) {
      allParagraphs.push(...tiptapJsonToDocxParagraphs(node.content));
    }
  }

  const doc = new Document({
    creator: author || 'Scriptorium',
    title,
    description: 'Exported from Scriptorium',
    sections: [
      {
        properties: {
          page: {
            margin: { top: 1440, right: 1440, bottom: 1440, left: 1440 },
          },
        },
        children: allParagraphs,
      },
    ],
  });

  const blob = await Packer.toBlob(doc);
  triggerDownload(blob, `${slugify(title)}.docx`);
}
