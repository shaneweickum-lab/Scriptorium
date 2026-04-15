import {
  Document,
  Packer,
  Paragraph,
  TextRun,
  HeadingLevel,
  AlignmentType,
  Header,
  Footer,
  PageNumber,
  TableOfContents,
  convertInchesToTwip,
  SectionType,
  PageBreak,
  type FileChild,
} from 'docx';
import type { Assembly, WritingNode, Book } from '../../types';
import { tiptapJsonToDocxParagraphs } from '../../utils/tiptapToDocx';

export interface KdpExportOptions {
  pageWidthIn: number;
  pageHeightIn: number;
  pageCountRange: '24-150' | '151-300' | '301-500' | '501-700' | '701-828';
  dedication: string;
  chapterTitlesOnOwnPage: boolean;
}

// KDP gutter margin table (inside margins by page count range)
const GUTTER_MAP: Record<KdpExportOptions['pageCountRange'], number> = {
  '24-150': 0.375,
  '151-300': 0.5,
  '301-500': 0.625,
  '501-700': 0.75,
  '701-828': 0.875,
};

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
  return (
    str
      .replace(/[^a-z0-9]/gi, '-')
      .toLowerCase()
      .replace(/-+/g, '-')
      .replace(/^-|-$/g, '') || 'manuscript'
  );
}

function emptyHeader(): Header {
  return new Header({ children: [new Paragraph('')] });
}

export async function exportDocxKdp(
  assembly: Assembly,
  nodeMap: Map<string, WritingNode>,
  book: Book | null,
  options: KdpExportOptions
): Promise<void> {
  const title = book?.title || 'Untitled';
  const author = book?.author || '';
  const authorLastName = author
    ? author.trim().split(/\s+/).at(-1) ?? 'Author'
    : 'Author';
  const year = new Date().getFullYear();

  const insideIn = GUTTER_MAP[options.pageCountRange];
  const outsideIn = 0.25;

  // Twip measurements
  const topTwip = convertInchesToTwip(0.5);
  const bottomTwip = convertInchesToTwip(0.75);
  const insideTwip = convertInchesToTwip(insideIn);
  const outsideTwip = convertInchesToTwip(outsideIn);
  const headerDistTwip = convertInchesToTwip(0.25);
  const footerDistTwip = convertInchesToTwip(0.25);
  const pageWidthTwip = convertInchesToTwip(options.pageWidthIn);
  const pageHeightTwip = convertInchesToTwip(options.pageHeightIn);

  // ─── FRONT MATTER SECTION ───────────────────────────────────────────────────
  const frontMatterChildren: FileChild[] = [];

  // Title page
  frontMatterChildren.push(
    new Paragraph({
      children: [new TextRun({ text: title, bold: true, size: 64 })],
      alignment: AlignmentType.CENTER,
      spacing: { before: 3000, after: 600 },
    })
  );
  if (author) {
    frontMatterChildren.push(
      new Paragraph({
        children: [new TextRun({ text: author, size: 28 })],
        alignment: AlignmentType.CENTER,
        spacing: { after: 3000 },
      })
    );
  }

  // Copyright page
  const copyrightText = [
    `Copyright © ${year} ${author || 'Author'}`,
    '',
    'All rights reserved. No part of this publication may be reproduced, distributed, or transmitted in any form or by any means, including photocopying, recording, or other electronic or mechanical methods, without the prior written permission of the author, except in the case of brief quotations embodied in critical reviews and certain other noncommercial uses permitted by copyright law.',
    '',
    'This is a work of fiction. Names, characters, places, and incidents are either the product of the author\'s imagination or are used fictitiously. Any resemblance to actual persons, living or dead, events, or locales is entirely coincidental.',
    '',
    `Published by ${author || 'Author'}`,
    'Printed in the United States of America',
  ];

  frontMatterChildren.push(
    new Paragraph({
      children: [new PageBreak()],
    })
  );
  for (const line of copyrightText) {
    frontMatterChildren.push(
      new Paragraph({
        children: [new TextRun({ text: line, size: 18 })],
        spacing: { after: line === '' ? 200 : 120 },
      })
    );
  }

  // Dedication page (optional)
  if (options.dedication.trim()) {
    frontMatterChildren.push(
      new Paragraph({
        children: [new PageBreak()],
      })
    );
    frontMatterChildren.push(
      new Paragraph({
        children: [
          new TextRun({ text: options.dedication.trim(), italics: true, size: 24 }),
        ],
        alignment: AlignmentType.CENTER,
        spacing: { before: 3000, after: 200 },
      })
    );
  }

  // Table of Contents page
  frontMatterChildren.push(
    new Paragraph({
      children: [new PageBreak()],
    })
  );
  frontMatterChildren.push(
    new Paragraph({
      children: [new TextRun({ text: 'Table of Contents', bold: true, size: 32 })],
      alignment: AlignmentType.CENTER,
      spacing: { before: 400, after: 400 },
    })
  );
  frontMatterChildren.push(
    new TableOfContents('Contents', {
      hyperlink: true,
      headingStyleRange: '1-1',
    })
  );

  // ─── MAIN CONTENT SECTION ───────────────────────────────────────────────────
  const mainChildren: Paragraph[] = [];

  const items = [...assembly.items].sort((a, b) => a.order - b.order);

  for (const item of items) {
    if (item.type === 'break') {
      mainChildren.push(
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
        mainChildren.push(
          new Paragraph({
            children: [new TextRun({ text: item.customTitle, bold: true })],
            heading: HeadingLevel.HEADING_2,
            pageBreakBefore: true,
          })
        );
      }
      if (item.content) {
        mainChildren.push(...tiptapJsonToDocxParagraphs(item.content));
      }
      continue;
    }

    if (!item.nodeId) continue;
    const node = nodeMap.get(item.nodeId);
    if (!node) continue;

    mainChildren.push(
      new Paragraph({
        children: [new TextRun({ text: node.title, bold: true, size: 36 })],
        heading: HeadingLevel.HEADING_1,
        pageBreakBefore: options.chapterTitlesOnOwnPage,
        spacing: { before: 200, after: 400 },
      })
    );

    // When chapter title is on its own page, add a page break after it
    // so the title stands alone and the prose begins on the next page
    if (options.chapterTitlesOnOwnPage) {
      mainChildren.push(
        new Paragraph({ children: [new PageBreak()] })
      );
    }

    if (node.content) {
      mainChildren.push(...tiptapJsonToDocxParagraphs(node.content));
    }
  }

  // ─── HEADERS / FOOTERS ──────────────────────────────────────────────────────
  // Even page header: book title, italic, centered
  const evenHeader = new Header({
    children: [
      new Paragraph({
        children: [new TextRun({ text: title, italics: true })],
        alignment: AlignmentType.CENTER,
      }),
    ],
  });

  // Odd page header: author last name, italic, centered
  const oddHeader = new Header({
    children: [
      new Paragraph({
        children: [new TextRun({ text: authorLastName, italics: true })],
        alignment: AlignmentType.CENTER,
      }),
    ],
  });

  // Footer: centered page number
  const pageFooter = new Footer({
    children: [
      new Paragraph({
        children: [
          new TextRun({
            children: [PageNumber.CURRENT],
          }),
        ],
        alignment: AlignmentType.CENTER,
      }),
    ],
  });

  // ─── DOCUMENT ───────────────────────────────────────────────────────────────
  const doc = new Document({
    creator: author || 'Scriptorium',
    title,
    description: 'Exported from Scriptorium (KDP format)',
    evenAndOddHeaderAndFooters: true,
    features: {
      updateFields: true,
    },
    sections: [
      // Section 1: Front matter (no headers/footers, roman-numeral style)
      {
        properties: {
          type: SectionType.NEXT_PAGE,
          page: {
            size: {
              width: pageWidthTwip,
              height: pageHeightTwip,
            },
            margin: {
              top: topTwip,
              bottom: bottomTwip,
              left: insideTwip,
              right: outsideTwip,
              header: headerDistTwip,
              footer: footerDistTwip,
              gutter: 0,
            },
          },
        },
        headers: {
          default: emptyHeader(),
          even: emptyHeader(),
          first: emptyHeader(),
        },
        footers: {
          default: new Footer({ children: [new Paragraph('')] }),
          even: new Footer({ children: [new Paragraph('')] }),
          first: new Footer({ children: [new Paragraph('')] }),
        },
        children: frontMatterChildren,
      },
      // Section 2: Main content
      {
        properties: {
          type: SectionType.NEXT_PAGE,
          titlePage: true,
          page: {
            size: {
              width: pageWidthTwip,
              height: pageHeightTwip,
            },
            margin: {
              top: topTwip,
              bottom: bottomTwip,
              left: insideTwip,
              right: outsideTwip,
              header: headerDistTwip,
              footer: footerDistTwip,
              gutter: 0,
            },
            pageNumbers: {
              start: 1,
            },
          },
        },
        headers: {
          default: oddHeader,
          even: evenHeader,
          first: emptyHeader(),
        },
        footers: {
          default: pageFooter,
          even: pageFooter,
          first: new Footer({ children: [new Paragraph('')] }),
        },
        children: mainChildren,
      },
    ],
  });

  const blob = await Packer.toBlob(doc);
  triggerDownload(blob, `${slugify(title)}-kdp.docx`);
}
