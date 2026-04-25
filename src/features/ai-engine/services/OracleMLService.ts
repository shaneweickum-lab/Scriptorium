/**
 * OracleMLService — local corpus analysis engine for Scriptorium.
 *
 * Reads every WritingNode the author has produced and builds an OracleProfile:
 * a rich, growing portrait of their craft. The profile is injected into every
 * Meyvn prompt so her suggestions feel more native to the author's voice the
 * more they write.
 *
 * Four oracle levels based on total word count:
 *
 *   Apprentice  < 2,000 words   — early impressions, limited insight
 *   Journeyman  2,000–10,000    — clear voice fingerprint emerging
 *   Master      10,000–50,000   — full craft analysis, blind spots identified
 *   Oracle      50,000+         — Meyvn knows this author as well as themselves
 *
 * All analysis is pure JavaScript — no network calls, no ML models beyond
 * the embedding model already loaded by VectorIndexService. Runs in under
 * ~50 ms for typical novel-length corpora.
 */

import { tiptapJsonToText } from '../../../utils/tiptapToHtml';
import type { WritingNode } from '../../../types';

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export type OracleLevel = 'apprentice' | 'journeyman' | 'master' | 'oracle';

export interface OracleProfile {
  bookId: string;
  oracleLevel: OracleLevel;
  lastAnalyzed: number;
  wordsAnalyzed: number;
  scenesAnalyzed: number;

  /** Point-of-view detection (heuristic pronoun analysis). */
  pov: 'first' | 'second' | 'third' | 'unknown';

  /** Ratio of words inside dialogue quotes to total words (0–1). */
  dialogueRatio: number;

  /** Introspective verb density: cognitive verbs per 100 words. */
  interiority: number;

  /** Sensory word density per 100 words. */
  sensoryDensity: number;

  /** Pacing style inferred from action-verb density and sentence length. */
  pacingStyle: 'kinetic' | 'measured' | 'lyrical';

  /** How scenes most commonly open. */
  sceneOpeningStyle: 'action' | 'dialogue' | 'description' | 'mixed';

  /** Average words per scene (prose nodes only). */
  avgSceneLength: number;

  /** Average words per paragraph. */
  avgParagraphLength: number;

  /** Standard deviation of sentence lengths — proxy for rhythmic variety. */
  sentenceVariance: number;

  /** The author's most distinctive non-stop-word vocabulary (top 15). */
  signatureWords: string[];

  /** Dominant thematic clusters detected across the corpus. */
  themes: string[];

  /** Identified craft strengths (used as positive reinforcement in prompts). */
  strengths: string[];

  /**
   * Areas where Meyvn will gently support growth without pointing it out
   * directly to the author — woven into her suggestions organically.
   */
  developmentAreas: string[];

  /**
   * The fully-rendered oracle knowledge string injected into every
   * Meyvn system prompt. Pre-built here so RagService can use it directly.
   */
  oracleKnowledge: string;
}

// ---------------------------------------------------------------------------
// Word lists
// ---------------------------------------------------------------------------

const STOP_WORDS = new Set([
  'a', 'an', 'the', 'and', 'but', 'or', 'for', 'nor', 'so', 'yet',
  'at', 'by', 'in', 'of', 'on', 'to', 'up', 'as', 'is', 'it', 'its',
  'be', 'was', 'are', 'were', 'has', 'had', 'have', 'do', 'did', 'does',
  'been', 'being', 'that', 'this', 'these', 'those', 'i', 'me', 'my',
  'we', 'us', 'our', 'you', 'your', 'he', 'him', 'his', 'she', 'her',
  'they', 'them', 'their', 'what', 'which', 'who', 'when', 'where',
  'why', 'how', 'all', 'each', 'every', 'both', 'few', 'more', 'most',
  'other', 'some', 'such', 'than', 'then', 'into', 'with', 'from',
  'will', 'would', 'could', 'should', 'not', 'no', 'if', 'about', 'out',
  'just', 'also', 'said', 'say', 'went', 'come', 'came', 'go', 'get',
  'got', 'one', 'like', 'know', 'can', 'may', 'might', 'there', 'here',
  'now', 'back', 'still', 'even', 'only', 'after', 'before', 'through',
  'while', 'without', 'down', 'off', 'too', 'very', 'much', 'well',
  'own', 'made', 'make', 'see', 'saw', 'look', 'looked', 'turn',
  'turned', 'put', 'take', 'took', 'think', 'thought', 'felt', 'feel',
  'want', 'wanted', 'need', 'try', 'tried', 'keep', 'kept', 'let',
  'set', 'find', 'found', 'again', 'never', 'always', 'away', 'long',
  'little', 'right', 'old', 'new', 'first', 'last', 'good', 'great',
  'head', 'hand', 'man', 'woman', 'day', 'way', 'time', 'thing',
  'things', 'life', 'door', 'room', 'light', 'night', 'face', 'end',
  'two', 'three', 'over', 'under', 'between', 'around', 'across',
  'something', 'nothing', 'everything', 'anything', 'someone', 'anyone',
  'everyone', 'no one', 'into', 'onto', 'upon', 'toward', 'towards',
]);

const ACTION_VERBS = new Set([
  'ran', 'run', 'sprint', 'dash', 'rush', 'leap', 'jump', 'grab', 'seized',
  'seize', 'strike', 'struck', 'hit', 'throw', 'threw', 'catch', 'caught',
  'chase', 'chased', 'escape', 'escaped', 'fall', 'fell', 'burst', 'crash',
  'crashed', 'shatter', 'shattered', 'draw', 'drew', 'slash', 'slashed',
  'charge', 'charged', 'duck', 'ducked', 'dodge', 'dodged', 'spin', 'spun',
  'roll', 'rolled', 'pull', 'pushed', 'slam', 'slammed', 'rip', 'tore',
  'tear', 'flung', 'fling', 'lunged', 'lunge', 'snap', 'snapped',
]);

const INTROSPECTIVE_VERBS = new Set([
  'wonder', 'wondered', 'pondered', 'ponder', 'consider', 'considered',
  'imagine', 'imagined', 'realize', 'realized', 'realise', 'realised',
  'remember', 'remembered', 'recall', 'recalled', 'reflect', 'reflected',
  'believe', 'believed', 'understand', 'understood', 'hope', 'hoped',
  'fear', 'feared', 'doubt', 'doubted', 'sense', 'sensed', 'notice',
  'noticed', 'expect', 'expected', 'suspect', 'suspected', 'suppose',
  'supposed', 'question', 'questioned', 'wish', 'wished', 'dread',
  'dreaded', 'long', 'longed', 'yearn', 'yearned', 'contemplate',
  'contemplated', 'muse', 'mused', 'brood', 'brooded',
]);

const SENSORY_WORDS = new Set([
  'bright', 'dark', 'pale', 'shadow', 'glow', 'gleam', 'shimmer', 'flash',
  'loud', 'quiet', 'silent', 'hush', 'murmur', 'roar', 'whisper', 'echo',
  'warm', 'cold', 'chill', 'heat', 'cool', 'freeze', 'burn', 'sting',
  'smooth', 'rough', 'sharp', 'soft', 'hard', 'brittle', 'tender', 'coarse',
  'sweet', 'bitter', 'sour', 'salt', 'taste', 'smell', 'reek', 'scent',
  'fragrant', 'stench', 'aroma', 'perfume', 'damp', 'moist', 'dry', 'wet',
  'heavy', 'light', 'thick', 'thin', 'deep', 'hollow', 'narrow', 'wide',
  'crimson', 'scarlet', 'golden', 'silver', 'ebony', 'ivory', 'azure',
  'verdant', 'pale', 'violet', 'amber', 'jade', 'obsidian',
]);

const THEMATIC_CLUSTERS: Record<string, string[]> = {
  'death & loss': [
    'death', 'die', 'dead', 'dying', 'loss', 'grief', 'mourn', 'funeral',
    'ghost', 'grave', 'corpse', 'widow', 'orphan', 'bury', 'buried', 'tomb',
    'slain', 'slay', 'murder', 'perish', 'perished', 'wither', 'fade',
  ],
  'love & longing': [
    'love', 'heart', 'soul', 'embrace', 'kiss', 'longing', 'devotion',
    'tender', 'bond', 'beloved', 'desire', 'passion', 'yearning', 'adore',
    'affection', 'cherish', 'intimate', 'ache', 'ached',
  ],
  'power & ambition': [
    'power', 'control', 'command', 'rule', 'authority', 'dominate', 'throne',
    'empire', 'kingdom', 'conquer', 'vanquish', 'crown', 'lord', 'sovereign',
    'ambition', 'glory', 'triumph', 'victory', 'defeat',
  ],
  'betrayal & deception': [
    'betray', 'betrayal', 'lie', 'deceive', 'traitor', 'mask', 'false',
    'scheme', 'plot', 'trick', 'cunning', 'manipulate', 'pretend', 'facade',
    'illusion', 'hidden', 'secret', 'spy', 'conspire', 'corrupt',
  ],
  'war & conflict': [
    'battle', 'war', 'fight', 'blood', 'weapon', 'soldier', 'army',
    'wound', 'kill', 'blade', 'sword', 'arrow', 'siege', 'fortress',
    'enemy', 'foe', 'combat', 'clash', 'assault', 'conquest',
  ],
  'mystery & the unknown': [
    'shadow', 'mystery', 'unknown', 'hidden', 'secret', 'darkness',
    'whisper', 'omen', 'curse', 'prophecy', 'ancient', 'ruin', 'forgotten',
    'vanish', 'strange', 'dread', 'sinister', 'lurk', 'haunted',
  ],
  'transformation & becoming': [
    'change', 'transform', 'grow', 'evolve', 'become', 'awaken', 'emerge',
    'rise', 'reborn', 'rebirth', 'forge', 'trial', 'journey', 'path',
    'chosen', 'destiny', 'fate', 'purpose', 'calling',
  ],
  'isolation & exile': [
    'alone', 'lonely', 'isolate', 'solitude', 'exile', 'forgotten',
    'abandoned', 'outcast', 'banish', 'wanderer', 'lost', 'adrift',
    'forsaken', 'estranged', 'separate', 'distant',
  ],
};

// ---------------------------------------------------------------------------
// Analysis helpers
// ---------------------------------------------------------------------------

function tokenize(text: string): string[] {
  return text.toLowerCase().match(/\b[a-z']+\b/g) ?? [];
}

function sentences(text: string): string[] {
  return text.split(/[.!?]+/).map((s) => s.trim()).filter((s) => s.length > 10);
}

function paragraphs(text: string): string[] {
  return text.split(/\n\n+/).map((p) => p.trim()).filter((p) => p.length > 20);
}

function wordCount(text: string): number {
  return text.trim().split(/\s+/).filter(Boolean).length;
}

function detectPOV(words: string[]): 'first' | 'second' | 'third' | 'unknown' {
  const counts = { first: 0, second: 0, third: 0 };
  for (const w of words) {
    if (['i', "i'm", "i've", "i'd", "i'll", 'me', 'my', 'mine', 'myself', 'we', 'our', 'us'].includes(w)) counts.first++;
    else if (['you', "you're", 'your', 'yours', 'yourself', 'yourself'].includes(w)) counts.second++;
    else if (['he', 'she', 'they', 'him', 'her', 'his', 'their', 'it', 'them'].includes(w)) counts.third++;
  }
  const total = counts.first + counts.second + counts.third;
  if (total === 0) return 'unknown';
  if (counts.first / total > 0.4) return 'first';
  if (counts.second / total > 0.3) return 'second';
  return 'third';
}

/** Count words inside straight or curly quotes. */
function dialogueRatio(text: string): number {
  const total = wordCount(text);
  if (total === 0) return 0;
  const dialogueMatches = text.match(/[""\u201c\u201d][^""\u201c\u201d]{2,200}[""\u201c\u201d]/g) ?? [];
  const dialogueWords = dialogueMatches.reduce((acc, m) => acc + wordCount(m), 0);
  return Math.min(1, dialogueWords / total);
}

function densityPer100(words: string[], wordSet: Set<string>): number {
  if (words.length === 0) return 0;
  const hits = words.filter((w) => wordSet.has(w)).length;
  return (hits / words.length) * 100;
}

function sentenceVariance(text: string): number {
  const ss = sentences(text);
  if (ss.length < 3) return 0;
  const lengths = ss.map((s) => s.split(/\s+/).length);
  const mean = lengths.reduce((a, b) => a + b, 0) / lengths.length;
  const variance = lengths.reduce((acc, l) => acc + (l - mean) ** 2, 0) / lengths.length;
  return Math.sqrt(variance);
}

function avgParagraphLength(text: string): number {
  const pp = paragraphs(text);
  if (pp.length === 0) return 0;
  return pp.reduce((acc, p) => acc + wordCount(p), 0) / pp.length;
}

function detectPacingStyle(
  words: string[],
  avgSentLen: number,
): 'kinetic' | 'measured' | 'lyrical' {
  const actionDensity = densityPer100(words, ACTION_VERBS);
  // kinetic: lots of action + short sentences
  if (actionDensity > 3 && avgSentLen < 15) return 'kinetic';
  // lyrical: long sentences + low action density
  if (avgSentLen > 22 && actionDensity < 1.5) return 'lyrical';
  return 'measured';
}

function detectSceneOpeningStyle(
  nodes: WritingNode[],
): 'action' | 'dialogue' | 'description' | 'mixed' {
  const proseNodes = nodes.filter((n) => n.content && wordCount(tiptapJsonToText(n.content)) > 100);
  if (proseNodes.length === 0) return 'mixed';

  let action = 0, dialogue = 0, description = 0;

  for (const node of proseNodes) {
    const text = tiptapJsonToText(node.content ?? '');
    // Get first ~100 characters
    const opener = text.slice(0, 120).toLowerCase();
    if (opener.includes('"') || opener.includes('\u201c')) {
      dialogue++;
    } else {
      const firstWords = tokenize(opener);
      const hasAction = firstWords.some((w) => ACTION_VERBS.has(w));
      if (hasAction) {
        action++;
      } else {
        description++;
      }
    }
  }

  const total = action + dialogue + description;
  const threshold = total * 0.5;
  if (action >= threshold) return 'action';
  if (dialogue >= threshold) return 'dialogue';
  if (description >= threshold) return 'description';
  return 'mixed';
}

function extractSignatureWords(words: string[]): string[] {
  const freq = new Map<string, number>();
  for (const w of words) {
    if (w.length < 4 || STOP_WORDS.has(w)) continue;
    freq.set(w, (freq.get(w) ?? 0) + 1);
  }
  return [...freq.entries()]
    .filter(([, count]) => count >= 3) // appeared at least 3 times
    .sort((a, b) => b[1] - a[1])
    .slice(0, 15)
    .map(([word]) => word);
}

function detectThemes(words: string[]): string[] {
  const wordSet = new Set(words);
  const scores: { theme: string; score: number }[] = [];

  for (const [theme, markers] of Object.entries(THEMATIC_CLUSTERS)) {
    const hits = markers.filter((m) => wordSet.has(m)).length;
    const density = (hits / words.length) * 1000; // per 1000 words
    if (density > 0.5) scores.push({ theme, score: density });
  }

  return scores
    .sort((a, b) => b.score - a.score)
    .slice(0, 3)
    .map((s) => s.theme);
}

// ---------------------------------------------------------------------------
// Strengths & development areas
// ---------------------------------------------------------------------------

function identifyStrengths(profile: Omit<OracleProfile, 'strengths' | 'developmentAreas' | 'oracleKnowledge'>): string[] {
  const s: string[] = [];

  if (profile.sensoryDensity > 4) s.push('vivid sensory prose — the world feels tangible');
  if (profile.dialogueRatio > 0.28) s.push('natural, character-driven dialogue');
  if (profile.sentenceVariance > 8) s.push('musical sentence rhythm — strong variety of long and short');
  if (profile.interiority > 2.5) s.push('deep psychological access — readers live inside the character');
  if (profile.signatureWords.length > 10) s.push('distinctive personal vocabulary — an unmistakable voice');
  if (profile.avgSceneLength > 1200) s.push('fully-developed scenes — ideas are given room to breathe');
  if (profile.pacingStyle === 'kinetic') s.push('propulsive pacing — scenes move with urgency');
  if (profile.pacingStyle === 'lyrical') s.push('lyrical pacing — prose has weight and atmosphere');

  return s.length > 0 ? s : ['a consistent voice across all scenes'];
}

function identifyDevelopmentAreas(profile: Omit<OracleProfile, 'strengths' | 'developmentAreas' | 'oracleKnowledge'>): string[] {
  const d: string[] = [];

  if (profile.sensoryDensity < 2) d.push('grounding scenes with more sensory detail');
  if (profile.dialogueRatio < 0.08 && profile.wordsAnalyzed > 3000) d.push('using dialogue to reveal character between action beats');
  if (profile.sentenceVariance < 4) d.push('varying sentence length for better prose rhythm');
  if (profile.avgParagraphLength > 160) d.push('breaking dense passages into smaller, more dynamic beats');
  if (profile.interiority < 1 && profile.wordsAnalyzed > 5000) d.push('deepening character interiority between action moments');
  if (profile.avgSceneLength < 400 && profile.wordsAnalyzed > 3000) d.push('expanding scenes to let key moments develop fully');

  return d;
}

// ---------------------------------------------------------------------------
// Oracle knowledge string builder
// ---------------------------------------------------------------------------

function oracleLevelLabel(level: OracleLevel): string {
  switch (level) {
    case 'apprentice': return 'early impressions — the author\'s voice is still forming in her sight';
    case 'journeyman': return 'a clear voice fingerprint has emerged across the writing sessions';
    case 'master': return 'a deep craft portrait — Meyvn knows this author\'s strengths, patterns, and tendencies';
    case 'oracle': return 'complete oracle sight — Meyvn knows this author\'s voice as well as they know themselves';
  }
}

function buildOracleKnowledge(
  profile: Omit<OracleProfile, 'oracleKnowledge'>,
): string {
  const level = profile.oracleLevel;

  if (level === 'apprentice') {
    return `--- THE ORACLE'S LEARNING ---
Meyvn has read ${profile.wordsAnalyzed.toLocaleString()} words from this author — still early. \
She carries these first impressions: ${profile.pov !== 'unknown' ? `${profile.pov}-person perspective` : 'perspective not yet clear'}. \
She will listen closely as the author continues to write, learning their voice with each new passage.
--- END OF ORACLE ---`;
  }

  const povDesc = {
    first: 'first-person — intimate, immediate, the narrator IS the story',
    second: 'second-person — unusual and immersive, "you" carries the reader in',
    third: 'third-person — narrated distance, the camera placed close to the protagonist',
    unknown: 'shifting or mixed perspective',
  }[profile.pov];

  const pacingDesc = {
    kinetic: 'kinetic — short sentences, action verbs, the prose moves at a run',
    measured: 'measured — balanced between movement and reflection',
    lyrical: 'lyrical — long rolling sentences, descriptive weight, atmosphere-first',
  }[profile.pacingStyle];

  const openingDesc = {
    action: 'in motion — scenes begin mid-action, pulling the reader in immediately',
    dialogue: 'in voice — scenes open with character speech, grounding us in personality first',
    description: 'in atmosphere — scenes are established with place or mood before action',
    mixed: 'varied — no single opening formula dominates',
  }[profile.sceneOpeningStyle];

  const lines: string[] = [
    `--- THE ORACLE'S LEARNING ---`,
    `Meyvn has studied ${profile.wordsAnalyzed.toLocaleString()} words across ${profile.scenesAnalyzed} scenes — ${oracleLevelLabel(level)}. This knowledge lives in every response she gives.`,
    ``,
    `PERSPECTIVE & VOICE`,
    `This author writes in ${povDesc}.`,
    profile.dialogueRatio > 0.15
      ? `Dialogue makes up ${Math.round(profile.dialogueRatio * 100)}% of the prose — a character-driven voice that trusts speech to reveal truth.`
      : profile.dialogueRatio < 0.08
      ? `Dialogue is sparse (${Math.round(profile.dialogueRatio * 100)}%) — this is a voice that lives in narration and interiority.`
      : `Dialogue is balanced at ${Math.round(profile.dialogueRatio * 100)}% — narration and speech carry equal weight.`,
    profile.interiority > 2
      ? `Character interiority is deep — thoughts blend with narration, the reader never leaves the protagonist\'s inner world.`
      : profile.interiority < 1
      ? `The voice stays mostly external — action and dialogue rather than introspection.`
      : ``,
  ].filter(Boolean);

  lines.push(``, `PACING & STRUCTURE`);
  lines.push(`Pacing is ${pacingDesc}.`);
  lines.push(`Scenes open ${openingDesc}.`);
  if (profile.avgSceneLength > 0) {
    lines.push(`Average scene length: ${Math.round(profile.avgSceneLength).toLocaleString()} words — ${
      profile.avgSceneLength > 1800 ? 'expansive, fully developed'
      : profile.avgSceneLength < 600 ? 'tight and focused'
      : 'medium-length, well-paced'
    }.`);
  }
  if (profile.sentenceVariance > 8) {
    lines.push(`Sentence rhythm is varied — short punches and long periods alternate naturally.`);
  } else if (profile.sentenceVariance < 4) {
    lines.push(`Sentences run at a consistent length — a stable, uniform rhythm.`);
  }

  if (profile.signatureWords.length > 0) {
    lines.push(``, `VOCABULARY FINGERPRINT`);
    lines.push(`Signature words this author reaches for: ${profile.signatureWords.slice(0, 8).join(', ')}.`);
    lines.push(`When Meyvn writes in this voice, these words — and their cognates — appear naturally.`);
  }

  if (profile.themes.length > 0) {
    lines.push(``, `THEMATIC CURRENTS`);
    lines.push(`The author returns to these waters: ${profile.themes.join(', ')}.`);
    lines.push(`Meyvn weaves these undercurrents in wherever they fit — they are the author\'s obsessions, not accidents.`);
  }

  if (profile.strengths.length > 0) {
    lines.push(``, `WHAT MAVEN KNOWS THIS AUTHOR DOES WELL`);
    profile.strengths.forEach((s) => lines.push(`• ${s}`));
    lines.push(`Meyvn reinforces these strengths — she does not smooth them away.`);
  }

  if (profile.developmentAreas.length > 0) {
    lines.push(``, `WHERE MAVEN ENRICHES THE WRITING ORGANICALLY`);
    lines.push(`Without calling attention to it, Meyvn will naturally introduce:`);
    profile.developmentAreas.forEach((d) => lines.push(`• ${d}`));
  }

  lines.push(``, `Every suggestion Meyvn makes grows from this ground. She writes as a seamless extension of this hand — not an imitation of it.`);
  lines.push(`--- END OF ORACLE ---`);

  return lines.join('\n');
}

// ---------------------------------------------------------------------------
// OracleMLService
// ---------------------------------------------------------------------------

export class OracleMLService {
  /**
   * Analyse the full writing corpus for a book and return an OracleProfile.
   *
   * @param nodes          All WritingNodes for the book (from writingStore).
   * @param bookId         Used to key the profile.
   * @param trainingTexts  Optional plain-text strings from the Training Portal.
   *                       These are appended to the corpus so Meyvn learns from
   *                       writing the author has done outside Scriptorium.
   */
  static analyze(
    nodes: WritingNode[],
    bookId: string,
    trainingTexts?: string[],
  ): OracleProfile {
    // Only analyse prose nodes that have content
    const proseNodes = nodes.filter(
      (n) => n.content && n.type !== 'part',
    );

    // Concatenate writing nodes as plain text
    const nodeText = proseNodes
      .map((n) => tiptapJsonToText(n.content ?? ''))
      .filter(Boolean)
      .join('\n\n');

    // Append training corpus (plain text, already extracted)
    const trainingBlock = trainingTexts
      ? trainingTexts.filter(Boolean).join('\n\n')
      : '';

    const fullText = [nodeText, trainingBlock].filter(Boolean).join('\n\n');

    const totalWords = wordCount(fullText);
    const words = tokenize(fullText);

    // Oracle level
    let oracleLevel: OracleLevel;
    if (totalWords < 2000) oracleLevel = 'apprentice';
    else if (totalWords < 10000) oracleLevel = 'journeyman';
    else if (totalWords < 50000) oracleLevel = 'master';
    else oracleLevel = 'oracle';

    // Sentence analysis
    const allSentences = sentences(fullText);
    const avgSentLen = allSentences.length > 0
      ? allSentences.reduce((acc, s) => acc + wordCount(s), 0) / allSentences.length
      : 15;

    // Scene lengths
    const sceneLengths = proseNodes
      .map((n) => wordCount(tiptapJsonToText(n.content ?? '')))
      .filter((l) => l > 50);
    const avgSceneLength = sceneLengths.length > 0
      ? sceneLengths.reduce((a, b) => a + b, 0) / sceneLengths.length
      : 0;

    // Build partial profile (without strengths/developmentAreas/oracleKnowledge)
    const partial = {
      bookId,
      oracleLevel,
      lastAnalyzed: Date.now(),
      wordsAnalyzed: totalWords,
      scenesAnalyzed: proseNodes.length,
      pov: detectPOV(words),
      dialogueRatio: dialogueRatio(fullText),
      interiority: densityPer100(words, INTROSPECTIVE_VERBS),
      sensoryDensity: densityPer100(words, SENSORY_WORDS),
      pacingStyle: detectPacingStyle(words, avgSentLen),
      sceneOpeningStyle: detectSceneOpeningStyle(proseNodes),
      avgSceneLength,
      avgParagraphLength: avgParagraphLength(fullText),
      sentenceVariance: sentenceVariance(fullText),
      signatureWords: extractSignatureWords(words),
      themes: detectThemes(words),
    } as const;

    const strengths = identifyStrengths(partial);
    const developmentAreas = identifyDevelopmentAreas(partial);

    const profileWithInsights = { ...partial, strengths, developmentAreas };
    const oracleKnowledge = buildOracleKnowledge(profileWithInsights);

    return { ...profileWithInsights, oracleKnowledge };
  }
}
