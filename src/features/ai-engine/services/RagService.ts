/**
 * RagService — Retrieval-Augmented Generation pipeline for Scriptorium.
 *
 * Retrieval step:
 *   User query → VectorIndexService.searchSimilar() → top-K WorldEntry chunks
 *
 * Augmentation step:
 *   Ranked chunks → system prompt that instructs the model to stay within
 *   the established lore.  The system prompt is the single source of truth
 *   for what the AI is allowed to draw on.
 *
 * All methods are static — RagService is a stateless helper, not a singleton.
 * State lives in the hook (useAuthorAI) that calls these methods.
 */

import type { OllamaMessage } from './OllamaService';
import type { SearchResult } from './VectorStore';
import type { VectorIndexService } from './VectorIndexService';

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

/** The assembled RAG context for one user query. */
export interface RagContext {
  /** Top-K lore entries retrieved from the vector index. */
  entries: SearchResult[];
  /** Ready-to-use system prompt string. */
  systemPrompt: string;
  /**
   * True when the vector index was available and entries were actually found.
   * False means the model will answer without world-specific context.
   */
  loreInjected: boolean;
}

// ---------------------------------------------------------------------------
// System prompt templates
// ---------------------------------------------------------------------------

/**
 * Baseline system prompt used when no lore context is available.
 * Gives the model a sane personality without world-specific grounding.
 */
const BARE_SYSTEM_PROMPT = `\
You are an expert creative writing assistant embedded in an author's writing application.
Help the author develop their story with clear, imaginative, and genre-appropriate suggestions.
Be concise unless the author explicitly asks for long-form content.`;

/**
 * Preamble injected before the lore entries when the vector index is available.
 * The lore block is appended between the fences.
 */
const RAG_PREAMBLE = `\
You are a creative writing assistant embedded in an author's writing application.
The author has provided the following lore entries from their World Bible.

RULES YOU MUST FOLLOW:
1. Ground every suggestion in the lore provided below.
2. Never contradict an established fact (character traits, place names, magic rules, etc.).
3. Do not invent new named characters, locations, or world rules beyond what is listed.
4. If the author's request cannot be addressed with the available lore, say so clearly \
and explain what additional lore would be needed.
5. Write in a tone consistent with the genre implied by the entries.
6. Be concise unless the author explicitly asks for long-form content.

--- WORLD BIBLE LORE ---`;

const RAG_POSTAMBLE = `--- END OF LORE ---

Draw only from the lore above when making suggestions.`;

// ---------------------------------------------------------------------------
// RagService
// ---------------------------------------------------------------------------

export class RagService {
  /**
   * Run the retrieval step: embed the user query and return the top-K most
   * semantically similar World Bible entries from the in-memory index.
   *
   * Returns an empty array (not throws) if the index is not initialised,
   * so callers can degrade gracefully to bare-prompt mode.
   *
   * @param query         Plain-text user query or writing prompt.
   * @param indexService  VectorIndexService instance to query.
   * @param topK          Number of entries to retrieve (default 3).
   * @param minScore      Minimum cosine similarity threshold 0–1 (default 0.3).
   */
  static async retrieveEntries(
    query: string,
    indexService: VectorIndexService,
    topK = 3,
    minScore = 0.3,
  ): Promise<SearchResult[]> {
    if (!indexService.isInitialised) return [];
    try {
      return await indexService.searchSimilar(query, topK, minScore);
    } catch {
      return [];
    }
  }

  /**
   * Build the system prompt.
   *
   * If `entries` is non-empty, each entry is formatted as a titled block and
   * injected between the RAG fences.  Otherwise the bare prompt is returned.
   *
   * @param entries  Search results from the vector index (may be empty).
   */
  static buildSystemPrompt(entries: SearchResult[]): string {
    if (entries.length === 0) return BARE_SYSTEM_PROMPT;

    const blocks = entries.map((e, i) => {
      const header = e.sectionName
        ? `[${e.sectionName}] ${e.title}`
        : e.title;
      const tagLine = e.tags ? `Tags: ${e.tags}` : '';
      const chunkNote =
        e.chunkIndex > 0 ? ` (excerpt ${e.chunkIndex + 1})` : '';
      const lines = [
        `${i + 1}. ${header}${chunkNote}`,
        tagLine,
        e.text,
      ]
        .filter(Boolean)
        .join('\n');
      return lines;
    });

    return [RAG_PREAMBLE, '', ...blocks, '', RAG_POSTAMBLE].join('\n');
  }

  /**
   * Assemble the full context object (retrieval + prompt construction) in one call.
   * This is the main entry point used by useAuthorAI.
   */
  static async buildContext(
    query: string,
    indexService: VectorIndexService,
    topK = 3,
    minScore = 0.3,
  ): Promise<RagContext> {
    const entries = await RagService.retrieveEntries(
      query,
      indexService,
      topK,
      minScore,
    );
    const systemPrompt = RagService.buildSystemPrompt(entries);
    return { entries, systemPrompt, loreInjected: entries.length > 0 };
  }

  /**
   * Construct the final message array sent to OllamaService.chat().
   *
   * Layout:
   *   [system]     — world-lore-grounded system prompt (or bare prompt)
   *   [...history] — optional prior conversation turns
   *   [user]       — the current user prompt
   *
   * `history` can be maintained externally (e.g. in component state) for
   * multi-turn sessions.  Pass an empty array (default) for single-shot use.
   *
   * @param userPrompt  The author's plain-text request.
   * @param context     Output of buildContext().
   * @param history     Prior conversation turns (system message excluded).
   */
  static buildMessages(
    userPrompt: string,
    context: RagContext,
    history: OllamaMessage[] = [],
  ): OllamaMessage[] {
    return [
      { role: 'system', content: context.systemPrompt },
      ...history,
      { role: 'user', content: userPrompt },
    ];
  }

  /**
   * Convenience: run buildContext() then buildMessages() in one step.
   * Returns both the assembled messages and the retrieved entries so the
   * caller can display which lore was used.
   */
  static async buildRagMessages(
    userPrompt: string,
    indexService: VectorIndexService,
    history: OllamaMessage[] = [],
    topK = 3,
    minScore = 0.3,
  ): Promise<{ messages: OllamaMessage[]; context: RagContext }> {
    const context = await RagService.buildContext(
      userPrompt,
      indexService,
      topK,
      minScore,
    );
    const messages = RagService.buildMessages(userPrompt, context, history);
    return { messages, context };
  }
}
