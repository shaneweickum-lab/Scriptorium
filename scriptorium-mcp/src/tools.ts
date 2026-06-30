import { randomUUID } from 'node:crypto';
import type { Tool } from '@modelcontextprotocol/sdk/types.js';
import { getSync, queuePendingWrite } from './reader.js';
import { textToTiptap } from './tiptap.js';
import type { SyncNode, ScriptoriumSync } from './types.js';

type TextContent = { type: 'text'; text: string };
type ToolResult = { content: TextContent[] };

function text(s: string): ToolResult {
  return { content: [{ type: 'text', text: s }] };
}

function requireSync(): ScriptoriumSync {
  const sync = getSync();
  if (!sync) throw new Error('Sync file not loaded. Open Scriptorium, go to Book Settings → Sync, and connect a folder.');
  return sync;
}

// ── Outline builder ────────────────────────────────────────────────────────
function buildOutline(nodes: SyncNode[], parentId: string | null, depth = 0): string {
  const indent = '  '.repeat(depth);
  return nodes
    .filter((n) => n.parent_id === parentId)
    .sort((a, b) => a.order - b.order)
    .map((n) => {
      const wc = n.word_count > 0 ? ` (${n.word_count.toLocaleString()} words)` : '';
      const header = `${indent}[${n.type.toUpperCase()}] ${n.title}${wc}  id:${n.id}`;
      const children = buildOutline(nodes, n.id, depth + 1);
      return children ? `${header}\n${children}` : header;
    })
    .join('\n');
}

// ── Tool definitions ───────────────────────────────────────────────────────
export const TOOLS: Tool[] = [
  {
    name: 'list_books',
    description: 'List all books in the Scriptorium library with metadata and total word counts.',
    inputSchema: { type: 'object', properties: {}, required: [] },
  },
  {
    name: 'get_outline',
    description: 'Get the full hierarchical outline for a book — all parts, chapters, scenes, and notes with word counts and node IDs.',
    inputSchema: {
      type: 'object',
      properties: {
        book_id: { type: 'string', description: 'Book ID from list_books' },
      },
      required: ['book_id'],
    },
  },
  {
    name: 'get_scene',
    description: 'Get the full text content of a specific writing node (scene, chapter, note, etc.).',
    inputSchema: {
      type: 'object',
      properties: {
        node_id: { type: 'string', description: 'Node ID from get_outline' },
      },
      required: ['node_id'],
    },
  },
  {
    name: 'search_content',
    description: 'Search for a phrase across all writing nodes in a book. Returns matching node titles, IDs, and a snippet.',
    inputSchema: {
      type: 'object',
      properties: {
        book_id: { type: 'string', description: 'Book ID to search within' },
        query: { type: 'string', description: 'Text to search for (case-insensitive)' },
      },
      required: ['book_id', 'query'],
    },
  },
  {
    name: 'get_world_entries',
    description: 'Get world bible entries for a book, optionally filtered by section name (e.g. "Characters", "Places").',
    inputSchema: {
      type: 'object',
      properties: {
        book_id: { type: 'string', description: 'Book ID' },
        section: { type: 'string', description: 'Section name filter (optional, case-insensitive partial match)' },
      },
      required: ['book_id'],
    },
  },
  {
    name: 'get_world_entry',
    description: 'Get the full content and custom fields for a specific world bible entry.',
    inputSchema: {
      type: 'object',
      properties: {
        entry_id: { type: 'string', description: 'Entry ID from get_world_entries' },
      },
      required: ['entry_id'],
    },
  },
  {
    name: 'get_stats',
    description: 'Get word count and node count statistics for a book.',
    inputSchema: {
      type: 'object',
      properties: {
        book_id: { type: 'string', description: 'Book ID' },
      },
      required: ['book_id'],
    },
  },
  {
    name: 'write_scene',
    description: 'Queue new plain-text content for a writing node. Scriptorium will apply it on the next sync. Use sparingly — prefer suggesting edits and letting the writer accept them.',
    inputSchema: {
      type: 'object',
      properties: {
        node_id: { type: 'string', description: 'Node ID to update' },
        content: { type: 'string', description: 'New content as plain text. Use newlines to separate paragraphs.' },
      },
      required: ['node_id', 'content'],
    },
  },
];

// ── Handlers ───────────────────────────────────────────────────────────────
export async function handleTool(name: string, args: Record<string, unknown>): Promise<ToolResult> {
  const sync = requireSync();

  switch (name) {
    case 'list_books': {
      const rows = sync.books.map((b) => {
        const bookNodes = sync.writing_nodes.filter((n) => n.book_id === b.id);
        const totalWords = bookNodes.reduce((sum, n) => sum + n.word_count, 0);
        return {
          id: b.id,
          title: b.title,
          author: b.author || '(no author)',
          word_count: totalWords,
          word_goal: b.word_goal ?? null,
          synopsis: b.synopsis || '',
        };
      });
      return text(JSON.stringify(rows, null, 2));
    }

    case 'get_outline': {
      const bookId = args.book_id as string;
      const book = sync.books.find((b) => b.id === bookId);
      if (!book) throw new Error(`Book not found: ${bookId}`);
      const nodes = sync.writing_nodes.filter((n) => n.book_id === bookId);
      const outline = buildOutline(nodes, null);
      const totalWords = nodes.reduce((sum, n) => sum + n.word_count, 0);
      return text(`${book.title} by ${book.author || '(no author)'}\n${totalWords.toLocaleString()} words total\n\n${outline || '(no nodes yet)'}`);
    }

    case 'get_scene': {
      const nodeId = args.node_id as string;
      const node = sync.writing_nodes.find((n) => n.id === nodeId);
      if (!node) throw new Error(`Node not found: ${nodeId}`);
      const body = node.content_text || '(empty)';
      return text(`[${node.type.toUpperCase()}] ${node.title}\n${node.word_count} words\n\n${body}`);
    }

    case 'search_content': {
      const bookId = args.book_id as string;
      const query = (args.query as string).toLowerCase();
      const nodes = sync.writing_nodes.filter((n) => n.book_id === bookId);
      const results = nodes
        .filter((n) => n.content_text.toLowerCase().includes(query) || n.title.toLowerCase().includes(query))
        .map((n) => {
          const idx = n.content_text.toLowerCase().indexOf(query);
          const snippet = idx >= 0
            ? '…' + n.content_text.slice(Math.max(0, idx - 80), idx + 120).trim() + '…'
            : '(title match only)';
          return { id: n.id, type: n.type, title: n.title, snippet };
        });
      if (results.length === 0) return text('No matches found.');
      return text(results.map((r) => `[${r.type.toUpperCase()}] ${r.title}  id:${r.id}\n  ${r.snippet}`).join('\n\n'));
    }

    case 'get_world_entries': {
      const bookId = args.book_id as string;
      const sectionFilter = args.section ? (args.section as string).toLowerCase() : null;
      let entries = sync.world_entries.filter((e) => e.book_id === bookId);
      if (sectionFilter) {
        entries = entries.filter((e) => e.section_name.toLowerCase().includes(sectionFilter));
      }
      if (entries.length === 0) return text('No entries found.');
      const out = entries.map((e) =>
        `[${e.section_name}] ${e.title}  id:${e.id}${e.tags.length ? `  tags:${e.tags.join(',')}` : ''}`
      ).join('\n');
      return text(out);
    }

    case 'get_world_entry': {
      const entryId = args.entry_id as string;
      const entry = sync.world_entries.find((e) => e.id === entryId);
      if (!entry) throw new Error(`Entry not found: ${entryId}`);
      const parts = [
        `[${entry.section_name}] ${entry.title}`,
        entry.tags.length ? `Tags: ${entry.tags.join(', ')}` : null,
        entry.custom_fields.length
          ? entry.custom_fields.map((f) => `${f.label}: ${f.value}`).join('\n')
          : null,
        '',
        entry.content_text || '(empty)',
      ].filter((p) => p !== null);
      return text(parts.join('\n'));
    }

    case 'get_stats': {
      const bookId = args.book_id as string;
      const book = sync.books.find((b) => b.id === bookId);
      if (!book) throw new Error(`Book not found: ${bookId}`);
      const nodes = sync.writing_nodes.filter((n) => n.book_id === bookId);
      const byType = (t: string) => nodes.filter((n) => n.type === t);
      const totalWords = nodes.reduce((sum, n) => sum + n.word_count, 0);
      const progress = book.word_goal ? `${((totalWords / book.word_goal) * 100).toFixed(1)}% of ${book.word_goal.toLocaleString()} goal` : 'no goal set';
      return text([
        `${book.title}`,
        `Total words:  ${totalWords.toLocaleString()}  (${progress})`,
        `Parts:        ${byType('part').length}`,
        `Chapters:     ${byType('chapter').length}`,
        `Scenes:       ${byType('scene').length}`,
        `Notes:        ${byType('note').length}`,
        `World entries:${sync.world_entries.filter((e) => e.book_id === bookId).length}`,
      ].join('\n'));
    }

    case 'write_scene': {
      const nodeId = args.node_id as string;
      const content = args.content as string;
      const node = sync.writing_nodes.find((n) => n.id === nodeId);
      if (!node) throw new Error(`Node not found: ${nodeId}`);
      const raw = textToTiptap(content);
      const wordCount = content.trim().split(/\s+/).filter(Boolean).length;
      queuePendingWrite({
        id: randomUUID(),
        type: 'update_node_content',
        node_id: nodeId,
        content_raw: raw,
        content_text: content,
        written_at: new Date().toISOString(),
      });
      return text(`Queued write for "${node.title}" (${wordCount} words). Scriptorium will apply it on the next sync.`);
    }

    default:
      throw new Error(`Unknown tool: ${name}`);
  }
}
