import {
  Paragraph,
  TextRun,
  HeadingLevel,
  AlignmentType,
} from 'docx';

interface TipTapMark {
  type: string;
  attrs?: Record<string, unknown>;
}

interface TipTapNode {
  type: string;
  content?: TipTapNode[];
  text?: string;
  marks?: TipTapMark[];
  attrs?: Record<string, unknown>;
}

interface RunOptions {
  text?: string;
  bold?: boolean;
  italics?: boolean;
  underline?: Record<string, never>;
  strike?: boolean;
  break?: number;
}

function marksToRunOptions(marks: TipTapMark[] = []): RunOptions {
  const opts: RunOptions = {};
  for (const mark of marks) {
    if (mark.type === 'bold') opts.bold = true;
    if (mark.type === 'italic') opts.italics = true;
    if (mark.type === 'underline') opts.underline = {};
    if (mark.type === 'strike') opts.strike = true;
  }
  return opts;
}

function nodeToRuns(node: TipTapNode): TextRun[] {
  if (node.type === 'text') {
    return [new TextRun({ text: node.text || '', ...marksToRunOptions(node.marks) })];
  }
  if (node.type === 'hardBreak') {
    return [new TextRun({ break: 1 })];
  }
  const runs: TextRun[] = [];
  for (const child of node.content || []) {
    runs.push(...nodeToRuns(child));
  }
  return runs;
}

function getHeadingLevel(level: number): (typeof HeadingLevel)[keyof typeof HeadingLevel] {
  const levels: Record<number, (typeof HeadingLevel)[keyof typeof HeadingLevel]> = {
    1: HeadingLevel.HEADING_1,
    2: HeadingLevel.HEADING_2,
    3: HeadingLevel.HEADING_3,
    4: HeadingLevel.HEADING_4,
    5: HeadingLevel.HEADING_5,
    6: HeadingLevel.HEADING_6,
  };
  return levels[level] || HeadingLevel.HEADING_1;
}

function getAlignment(align: string | undefined): (typeof AlignmentType)[keyof typeof AlignmentType] | undefined {
  if (!align) return undefined;
  const map: Record<string, (typeof AlignmentType)[keyof typeof AlignmentType]> = {
    left: AlignmentType.LEFT,
    right: AlignmentType.RIGHT,
    center: AlignmentType.CENTER,
    justify: AlignmentType.JUSTIFIED,
  };
  return map[align];
}

export function tiptapJsonToDocxParagraphs(json: string): Paragraph[] {
  if (!json) return [];
  let doc: TipTapNode;
  try {
    doc = JSON.parse(json);
  } catch {
    return [];
  }

  const paragraphs: Paragraph[] = [];

  function processNode(node: TipTapNode) {
    if (node.type === 'doc') {
      for (const child of node.content || []) processNode(child);
      return;
    }

    if (node.type === 'paragraph') {
      const runs = nodeToRuns(node);
      const align = getAlignment(node.attrs?.textAlign as string);
      paragraphs.push(
        new Paragraph({
          children: runs.length ? runs : [new TextRun('')],
          alignment: align,
          spacing: { after: 200 },
        })
      );
      return;
    }

    if (node.type === 'heading') {
      const level = (node.attrs?.level as number) || 1;
      const runs = nodeToRuns(node);
      paragraphs.push(
        new Paragraph({
          children: runs,
          heading: getHeadingLevel(level),
        })
      );
      return;
    }

    if (node.type === 'blockquote') {
      for (const child of node.content || []) {
        if (child.type === 'paragraph') {
          paragraphs.push(
            new Paragraph({
              children: nodeToRuns(child).map((r) => new TextRun({ ...r, italics: true })),
              indent: { left: 720 },
              spacing: { after: 200 },
            })
          );
        }
      }
      return;
    }

    if (node.type === 'bulletList' || node.type === 'orderedList') {
      for (const item of node.content || []) {
        for (const child of item.content || []) {
          if (child.type === 'paragraph') {
            paragraphs.push(
              new Paragraph({
                children: nodeToRuns(child),
                bullet: node.type === 'bulletList' ? { level: 0 } : undefined,
                spacing: { after: 120 },
              })
            );
          }
        }
      }
      return;
    }

    if (node.type === 'horizontalRule') {
      paragraphs.push(
        new Paragraph({
          children: [new TextRun('* * *')],
          alignment: AlignmentType.CENTER,
        })
      );
      return;
    }

    for (const child of node.content || []) processNode(child);
  }

  processNode(doc);
  return paragraphs;
}
