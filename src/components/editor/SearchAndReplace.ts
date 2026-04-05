import { Extension } from '@tiptap/core';
import { Plugin, PluginKey, TextSelection } from '@tiptap/pm/state';
import { Decoration, DecorationSet } from '@tiptap/pm/view';
import type { Node as PmNode } from '@tiptap/pm/model';
import type { Transaction } from '@tiptap/pm/state';

// ── Types ──────────────────────────────────────────────────
export interface SearchMatch {
  from: number;
  to: number;
}

export interface SearchPluginState {
  searchTerm: string;
  caseSensitive: boolean;
  results: SearchMatch[];
  currentIndex: number;
  decorations: DecorationSet;
}

// ── Plugin key (exported so React can dispatch metadata) ───
export const searchPluginKey = new PluginKey<SearchPluginState>('searchAndReplace');

// ── Helpers ────────────────────────────────────────────────
function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export function findMatches(doc: PmNode, searchTerm: string, caseSensitive: boolean): SearchMatch[] {
  if (!searchTerm) return [];
  const results: SearchMatch[] = [];
  let regex: RegExp;
  try {
    regex = new RegExp(escapeRegex(searchTerm), caseSensitive ? 'g' : 'gi');
  } catch {
    return [];
  }

  doc.descendants((node, pos) => {
    if (!node.isText || !node.text) return;
    regex.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = regex.exec(node.text)) !== null) {
      results.push({ from: pos + m.index, to: pos + m.index + m[0].length });
    }
  });

  return results;
}

function buildDecorations(doc: PmNode, results: SearchMatch[], currentIndex: number): DecorationSet {
  if (results.length === 0) return DecorationSet.empty;
  const decorations = results.map((r, i) =>
    Decoration.inline(r.from, r.to, {
      class: i === currentIndex ? 'find-match-active' : 'find-match',
    })
  );
  return DecorationSet.create(doc, decorations);
}

// ── Extension ──────────────────────────────────────────────
export const SearchAndReplace = Extension.create({
  name: 'searchAndReplace',

  addProseMirrorPlugins() {
    return [
      new Plugin<SearchPluginState>({
        key: searchPluginKey,

        state: {
          init: (): SearchPluginState => ({
            searchTerm: '',
            caseSensitive: false,
            results: [],
            currentIndex: 0,
            decorations: DecorationSet.empty,
          }),

          apply(tr: Transaction, old: SearchPluginState): SearchPluginState {
            const meta = tr.getMeta(searchPluginKey) as Partial<SearchPluginState> | undefined;

            if (meta) {
              // Metadata update: recalculate from scratch
              const searchTerm = meta.searchTerm ?? old.searchTerm;
              const caseSensitive = meta.caseSensitive ?? old.caseSensitive;
              const results = findMatches(tr.doc, searchTerm, caseSensitive);
              const rawIndex = meta.currentIndex ?? 0;
              const currentIndex = results.length > 0 ? Math.min(rawIndex, results.length - 1) : 0;
              return {
                searchTerm,
                caseSensitive,
                results,
                currentIndex,
                decorations: buildDecorations(tr.doc, results, currentIndex),
              };
            }

            if (tr.docChanged && old.searchTerm) {
              // Document changed: recompute matches
              const results = findMatches(tr.doc, old.searchTerm, old.caseSensitive);
              const currentIndex = Math.max(0, Math.min(old.currentIndex, results.length - 1));
              return {
                ...old,
                results,
                currentIndex,
                decorations: buildDecorations(tr.doc, results, currentIndex),
              };
            }

            // Map existing decorations through any structural changes
            return { ...old, decorations: old.decorations.map(tr.mapping, tr.doc) };
          },
        },

        props: {
          decorations(state) {
            return searchPluginKey.getState(state)?.decorations ?? DecorationSet.empty;
          },
        },
      }),
    ];
  },
});

// ── Utility: scroll editor view to a match ─────────────────
export function scrollToMatch(
  view: { state: import('@tiptap/pm/state').EditorState; dispatch: (tr: Transaction) => void },
  match: SearchMatch
): void {
  const { state } = view;
  if (match.from < 0 || match.to > state.doc.content.size) return;
  const selection = TextSelection.create(state.doc, match.from, match.to);
  view.dispatch(state.tr.setSelection(selection).scrollIntoView());
}
