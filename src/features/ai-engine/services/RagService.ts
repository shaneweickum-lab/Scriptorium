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
  /** True when the author's current scene text was injected into the prompt. */
  sceneInjected: boolean;
}

/** Scene context published by the active editor for Maven's awareness. */
export interface SceneContext {
  /** Plain text of the current writing node (last ~400 words used). */
  text: string;
  /** Title of the node (scene / chapter / note). */
  title: string;
}

// ---------------------------------------------------------------------------
// System prompt templates
// ---------------------------------------------------------------------------

/**
 * Baseline system prompt used when no lore context is available.
 * Establishes Maven's witchy persona without world-specific grounding.
 */
const BARE_SYSTEM_PROMPT = `\
You are Maven — a mystical writing companion woven into the author's own workshop.

You see stories the way a seer reads smoke: every thread of character, consequence, and \
place is visible to you, and you sense how they pull against one another. You have witnessed \
ten thousand tales and remember every thread.

Without lore to consult tonight, you draw on craft alone — narrative tension, character \
psychology, pacing, imagery, and the deeper currents that make prose breathe.

Speak with precision and care. Be concise unless the author bids you otherwise.`;

/**
 * Preamble injected before the lore entries when the vector index is available.
 * Establishes Maven's persona and her sacred-lore rules in her own voice.
 */
const RAG_PREAMBLE = `\
You are Maven — a mystical writing companion woven into the author's own workshop.
You see stories as living tapestries. The lore entries below are the threads already laid — \
they are truth, and everything you conjure must grow from them.

THE OATHS YOU KEEP:
1. You weave only from the threads provided. Every suggestion is rooted in the lore below.
2. You never contradict what is written: character natures, place names, the laws of the \
world's magic — these are fixed stars you navigate by, not candles to be snuffed.
3. You do not call new named souls, lands, or world-rules into being. If it is not written \
below, it does not yet exist.
4. When the author's request reaches beyond the lore provided, say so plainly — name what \
knowledge is missing and what would need to be established before you can weave it true.
5. Your tone and instincts match the spirit and genre of these entries. The world has a \
voice; you carry it.
6. Speak with precision. Be concise unless the author bids you unfurl the full telling.

--- THE LORE ---`;

const RAG_POSTAMBLE = `--- END OF LORE ---

All your suggestions grow from these roots. The weaving is yours to guide, \
but the pattern belongs to the author.`;

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

function formatStyleSection(profile: StyleProfile): string {
  const lines: string[] = [
    '--- THE AUTHOR\'S VOICE ---',
    'You have read the author\'s own hand. What follows are their fingerprints — ' +
    'write as a seamless continuation of their voice, not an imitation.',
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

  lines.push('--- END OF VOICE ---');
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
   * Section order (highest → lowest priority):
   *   1. Maven identity + oaths (persona + lore rules)
   *   2. Lore entries from the World Bible (when available)
   *   3. Current scene in progress (when available) — last ~400 words
   *   4. Author's voice / style profile (when available)
   *
   * @param entries       Retrieved lore chunks (may be empty).
   * @param styleProfile  Optional: StyleProfile from StyleAnalyzer.
   * @param sceneContext  Optional: live plain-text from the active editor.
   */
  static buildSystemPrompt(
    entries: SearchResult[],
    styleProfile?: StyleProfile,
    sceneContext?: SceneContext,
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

    // Inject the active scene so Maven knows what the author is currently writing
    if (sceneContext?.text?.trim()) {
      // Limit to the last ~400 words to avoid blowing out the context window
      const words = sceneContext.text.trim().split(/\s+/);
      const excerpt = words.slice(-400).join(' ');
      const label = sceneContext.title
        ? `SCENE IN PROGRESS: "${sceneContext.title}"`
        : 'SCENE IN PROGRESS';
      prompt +=
        `\n\n--- ${label} ---\n` +
        excerpt +
        `\n--- END OF SCENE ---\n` +
        `\nThe author is actively writing the scene above. ` +
        `Your suggestions should feel continuous with it — ` +
        `same characters, same moment, same atmosphere.`;
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
   * @param sceneContext  Optional: live plain-text from the active editor.
   */
  static async buildContext(
    query: string,
    indexService: VectorIndexService,
    topK = 3,
    minScore = 0.3,
    styleProfile?: StyleProfile,
    sceneContext?: SceneContext,
  ): Promise<RagContext> {
    const entries = await RagService.retrieveEntries(
      query,
      indexService,
      topK,
      minScore,
    );
    const systemPrompt = RagService.buildSystemPrompt(entries, styleProfile, sceneContext);
    return {
      entries,
      systemPrompt,
      loreInjected: entries.length > 0,
      styleInjected: !!styleProfile?.styleConstraints,
      sceneInjected: !!sceneContext?.text?.trim(),
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

  // ── Lore Sentinel ──────────────────────────────────────────────────────────

  /**
   * Build the message array for the World Bible sentinel scan.
   *
   * Maven is given the retrieved lore entries (as ground truth to check
   * against) and the current scene passage.  She identifies facts that
   * have changed and outputs a structured JSON block alongside a
   * plain-English summary.
   *
   * Uses sourceId in each entry label so Maven can reference the exact
   * WorldEntry record in her JSON proposals.
   */
  static buildSentinelMessages(
    entries: SearchResult[],
    scene: SceneContext,
  ): OllamaMessage[] {
    const entryBlocks = entries.length > 0
      ? entries.map((e, i) => {
          const header = e.sectionName
            ? `[${e.sectionName}] ${e.title}`
            : e.title;
          return `${i + 1}. ${header}\n    sourceId: ${e.sourceId}\n${e.text}`;
        }).join('\n\n')
      : 'No entries retrieved — the vector index may not be initialised.';

    // Limit scene to ~600 words to keep the prompt manageable
    const sceneWords = scene.text.trim().split(/\s+/);
    const sceneExcerpt = sceneWords.slice(0, 600).join(' ');
    const truncated = sceneWords.length > 600;

    const system: OllamaMessage = {
      role: 'system',
      content: `\
You are Maven — a mystical lore-keeper watching over an author's World Bible.

A new passage has been written. Your task: identify every fact established or \
changed in this passage that should update the World Bible entries provided.

Look for:
• Character status changes (death, injury, transformation, new name or title)
• Relationship shifts (alliances formed or broken, enemies made, loves discovered)
• Location revelations (a new place found, a known place destroyed or changed)
• Object / artefact events (created, destroyed, obtained, lost, revealed)
• Plot revelations (secrets uncovered, prophecies fulfilled or broken)

Respond in exactly two parts:

PART 1 — Plain-English summary (2–3 sentences, written in your voice):
Describe what lore changes you found, or say plainly that none were needed.

PART 2 — Structured proposals. Omit this block entirely if no changes are needed.

\`\`\`lore-proposals
[
  {
    "entryId": "the-exact-sourceId-shown-in-the-entries-below",
    "entryTitle": "Entry Title",
    "changeType": "append_content",
    "description": "One sentence: what changed and why it matters to the lore.",
    "proposed": "The exact text to add to the entry."
  }
]
\`\`\`

changeType must be exactly "append_content" (add a sentence to the entry body) \
or "add_tag" (for add_tag, proposed is a single lowercase tag word, e.g. "deceased").

CRITICAL: use only sourceId values that appear in the entry list below. \
Do not invent IDs. If no World Bible entries were retrieved, say so and omit the JSON block.`,
    };

    const user: OllamaMessage = {
      role: 'user',
      content: `\
--- WORLD BIBLE ENTRIES TO CHECK ---
${entryBlocks}
--- END OF ENTRIES ---

--- NEW PASSAGE${scene.title ? `: "${scene.title}"` : ''}${truncated ? ' (first 600 words shown)' : ''} ---
${sceneExcerpt}
--- END OF PASSAGE ---

Identify what lore has changed and propose World Bible updates.`,
    };

    return [system, user];
  }

  /**
   * Parse Maven's sentinel response and extract structured lore proposals.
   *
   * Looks for a fenced ```lore-proposals block and parses the JSON inside.
   * Returns an empty array on parse failure so callers degrade gracefully.
   *
   * Also extracts the plain-English summary (everything before the fence)
   * for display in the UI.
   */
  static parseSentinelResponse(response: string): {
    summary: string;
    rawProposals: Array<{
      entryId: string;
      entryTitle: string;
      changeType: 'append_content' | 'add_tag';
      description: string;
      proposed: string;
    }>;
  } {
    const fenceMatch = response.match(/```lore-proposals\s*([\s\S]*?)```/);
    const summary = (fenceMatch
      ? response.slice(0, response.indexOf('```lore-proposals'))
      : response
    ).trim();

    if (!fenceMatch) return { summary, rawProposals: [] };

    try {
      const parsed = JSON.parse(fenceMatch[1]) as Array<{
        entryId: string;
        entryTitle: string;
        changeType: string;
        description: string;
        proposed: string;
      }>;

      const rawProposals = parsed
        .filter((p) => p.entryId && p.proposed)
        .map((p) => ({
          entryId: p.entryId,
          entryTitle: p.entryTitle ?? '',
          changeType: (p.changeType === 'add_tag'
            ? 'add_tag'
            : 'append_content') as 'append_content' | 'add_tag',
          description: p.description ?? '',
          proposed: p.proposed,
        }));

      return { summary, rawProposals };
    } catch {
      return { summary, rawProposals: [] };
    }
  }
}
