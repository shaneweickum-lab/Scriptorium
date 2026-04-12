/**
 * worldBibleTransformer — converts Scriptorium data shapes into plain text
 * suitable for embedding and semantic search.
 *
 * Deliberately avoids importing @tiptap/react so this module is safe to run
 * in Node.js test scripts and web workers without a DOM.
 */

import type { WorldEntry, WorldSection } from '../../../types';
import type { WritingNode } from '../../../types';

// ---------------------------------------------------------------------------
// Internal TipTap JSON → plain text (no @tiptap/react dependency)
// ---------------------------------------------------------------------------

interface TipTapNode {
  type?: string;
  text?: string;
  content?: TipTapNode[];
}

function walkTipTap(node: TipTapNode): string {
  if (node.text) return node.text;
  if (!node.content) return '';
  const parts = node.content.map(walkTipTap);
  // Paragraph / heading / blockquote — add newline between block nodes
  const blockTypes = new Set(['paragraph', 'heading', 'blockquote', 'bulletList', 'orderedList', 'listItem', 'codeBlock']);
  const sep = node.type && blockTypes.has(node.type) ? '\n' : '';
  return parts.join(sep);
}

/**
 * Extract readable plain text from a TipTap JSON string without any
 * browser-only dependencies.
 */
export function extractText(tiptapJson: string): string {
  if (!tiptapJson) return '';
  try {
    const doc: TipTapNode = JSON.parse(tiptapJson);
    return walkTipTap(doc).replace(/\n{3,}/g, '\n\n').trim();
  } catch {
    return '';
  }
}

// ---------------------------------------------------------------------------
// WorldEntry → embedding text
// ---------------------------------------------------------------------------

/**
 * Produce a single canonical string for a WorldEntry, suitable for embedding.
 *
 * Layout:
 *   [Section: <sectionName>]         ← optional category header
 *   <title>                          ← entry title (high-signal anchor)
 *   <body text>                      ← prose notes
 *   Tags: <tag1>, <tag2>             ← keyword signals
 *   <field label>: <field value>     ← one line per custom field with content
 */
export function worldEntryToText(
  entry: WorldEntry,
  section?: WorldSection,
): string {
  const lines: string[] = [];

  if (section?.name) {
    lines.push(`[Section: ${section.name}]`);
  }

  lines.push(entry.title);

  const body = extractText(entry.content);
  if (body) lines.push(body);

  if (entry.tags.length > 0) {
    lines.push(`Tags: ${entry.tags.join(', ')}`);
  }

  for (const field of entry.customFields) {
    const v = field.value.trim();
    if (v) lines.push(`${field.label}: ${v}`);
  }

  return lines.join('\n').trim();
}

// ---------------------------------------------------------------------------
// WritingNode → embedding text
// ---------------------------------------------------------------------------

/**
 * Produce a canonical string for a WritingNode (scene / chapter / etc.).
 * The title is prefixed so keyword searches on it still score well.
 */
export function writingNodeToText(node: WritingNode): string {
  const lines: string[] = [];
  if (node.type) lines.push(`[${node.type.toUpperCase()}]`);
  if (node.title) lines.push(node.title);
  if (node.synopsis) lines.push(node.synopsis);
  const body = extractText(node.content);
  if (body) lines.push(body);
  return lines.join('\n').trim();
}

// ---------------------------------------------------------------------------
// Batch helpers
// ---------------------------------------------------------------------------

export interface IndexableWorldEntry {
  id: string;
  title: string;
  sectionName: string;
  text: string;
  tags: string[];
}

/**
 * Convert an array of WorldEntry objects (with their section map) into
 * indexable records ready for VectorIndexService.
 */
export function worldEntriesToIndexable(
  entries: WorldEntry[],
  sections: WorldSection[],
): IndexableWorldEntry[] {
  const sectionMap = new Map(sections.map((s) => [s.id, s]));
  return entries.map((entry) => ({
    id: entry.id,
    title: entry.title,
    sectionName: sectionMap.get(entry.sectionId)?.name ?? 'World Bible',
    text: worldEntryToText(entry, sectionMap.get(entry.sectionId)),
    tags: entry.tags,
  }));
}
