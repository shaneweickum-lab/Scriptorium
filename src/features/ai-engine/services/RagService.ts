/**
 * RagService — Retrieval-Augmented Generation pipeline for Scriptorium.
 *
 * Retrieval step:
 *   User query → VectorIndexService.searchSimilar() → top-K WorldEntry chunks
 *
 * Augmentation step:
 *   Ranked chunks + optional StyleProfile → system prompt that instructs the
 *   model to stay within the established lore AND match the author's voice.
 *
 * All methods are static — RagService is a stateless helper, not a singleton.
 * State lives in the hook (useAuthorAI) that calls these methods.
 */

import type { OllamaMessage } from './OllamaService';
import type { SearchResult } from './VectorStore';
import type { VectorIndexService } from './VectorIndexService';
import type { StyleProfile } from './StyleAnalyzer';

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
  /** True when a StyleProfile was available and injected into the prompt. */
  styleInjected: boolean;
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
// Internal helpers
// ---------------------------------------------------------------------------

function formatStyleSection(profile: StyleProfile): string {
  const lines: string[] = [
    '--- AUTHOR STYLE PROFILE ---',
    profile.styleConstraints,
  ];

  // Add quantitative detail so the model can calibrate precisely
  lines.push(
    `Sentence structure: ${profile.sentences.category} ` +
    `(avg ${profile.sentences.avgLength} words, σ ${profile.sentences.stdDev}).`,
  );

  if (profile.vocabulary.dominant !== 'neutral') {
    lines.push(
      `Vocabulary register: ${profile.vocabulary.dominant}` +
      (profile.vocabulary.topArchaicWords.length > 0
        ? ` — archaic markers: ${profile.vocabulary.topArchaicWords.join(', ')}.`
        : '.'),
    );
  }

  const topMoods = Object.entries(profile.atmosphere.scores)
    .filter(([, v]) => v > 0)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([k, v]) => `${k} (${v}/100 words)`)
    .join(', ');
  if (topMoods) {
    lines.push(`Atmosphere: ${topMoods}.`);
  }

  lines.push('--- END STYLE PROFILE ---');
  return lines.join('\n');
}

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
   * When `entries` is non-empty, each entry is formatted as a titled block
   * between the RAG fences.  When `styleProfile` is provided, a dedicated
   * style section is appended, giving the model explicit voice constraints:
   *
   *   "Write in a dark, mysterious, archaic voice with short, punchy
   *    sentences (~9 words avg). Match the author's established style."
   *
   * @param entries      Retrieved lore chunks (may be empty).
   * @param styleProfile Optional: StyleProfile from StyleAnalyzer.
   */
  static buildSystemPrompt(
    entries: SearchResult[],
    styleProfile?: StyleProfile,
  ): string {
    let prompt: string;

    if (entries.length === 0) {
      prompt = BARE_SYSTEM_PROMPT;
    } else {
      const blocks = entries.map((e, i) => {
        const header = e.sectionName
          ? `[${e.sectionName}] ${e.title}`
          : e.title;
        const tagLine = e.tags ? `Tags: ${e.tags}` : '';
        const chunkNote =
          e.chunkIndex > 0 ? ` (excerpt ${e.chunkIndex + 1})` : '';
        return [
          `${i + 1}. ${header}${chunkNote}`,
          tagLine,
          e.text,
        ]
          .filter(Boolean)
          .join('\n');
      });

      prompt = [RAG_PREAMBLE, '', ...blocks, '', RAG_POSTAMBLE].join('\n');
    }

    // Append style constraints when a profile is available
    if (styleProfile?.styleConstraints) {
      prompt += '\n\n' + formatStyleSection(styleProfile);
    }

    return prompt;
  }

  /**
   * Assemble the full context object (retrieval + prompt construction) in one call.
   * This is the main entry point used by useAuthorAI.
   *
   * @param styleProfile  Optional: inject style constraints into the system prompt.
   */
  static async buildContext(
    query: string,
    indexService: VectorIndexService,
    topK = 3,
    minScore = 0.3,
    styleProfile?: StyleProfile,
  ): Promise<RagContext> {
    const entries = await RagService.retrieveEntries(
      query,
      indexService,
      topK,
      minScore,
    );
    const systemPrompt = RagService.buildSystemPrompt(entries, styleProfile);
    return {
      entries,
      systemPrompt,
      loreInjected: entries.length > 0,
      styleInjected: !!styleProfile?.styleConstraints,
    };
  }

  /**
   * Construct the final message array sent to OllamaService.chat().
   *
   * Layout:
   *   [system]     — lore-grounded + style-constrained prompt
   *   [...history] — optional prior conversation turns
   *   [user]       — the current user prompt
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
   *
   * @param styleProfile  Optional style constraints.
   */
  static async buildRagMessages(
    userPrompt: string,
    indexService: VectorIndexService,
    history: OllamaMessage[] = [],
    topK = 3,
    minScore = 0.3,
    styleProfile?: StyleProfile,
  ): Promise<{ messages: OllamaMessage[]; context: RagContext }> {
    const context = await RagService.buildContext(
      userPrompt,
      indexService,
      topK,
      minScore,
      styleProfile,
    );
    const messages = RagService.buildMessages(userPrompt, context, history);
    return { messages, context };
  }
}
