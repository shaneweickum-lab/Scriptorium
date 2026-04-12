/**
 * StyleAnalyzer — 100 % local, zero-dependency prose style analysis.
 *
 * Scans plain text (typically the author's last 2,000 words) and produces
 * a StyleProfile containing:
 *
 *   • Sentence metrics   — average length, standard deviation, category
 *                         (short / medium / long / varied)
 *
 *   • Vocabulary flavor  — proportion of archaic vs. contemporary markers,
 *                         with top matched words for transparency
 *
 *   • Atmosphere scores  — per-category keyword frequency (dark, hopeful,
 *                         violent, mysterious, romantic, epic) normalised
 *                         to occurrences per 100 words
 *
 *   • styleConstraints   — ready-to-inject LLM instruction string that
 *                         summarises the above in natural English
 *
 * No external APIs, no network calls, no Transformers.js — runs synchronously
 * in the browser main thread or in a Web Worker.
 */

// ---------------------------------------------------------------------------
// Word lists
// ---------------------------------------------------------------------------

/**
 * Words that mark distinctly archaic/elevated diction.
 * Commonly used in historical fiction, high fantasy, and period prose.
 */
const ARCHAIC_WORDS = new Set([
  // Old English pronouns & determiners
  'thou', 'thee', 'thy', 'thine', 'ye', 'yea', 'nay',
  // Archaic verb conjugations
  'hath', 'doth', 'hast', 'canst', 'wilt', 'art', 'wert',
  'shalt', 'wouldst', 'shouldst', 'couldst', 'durst', 'mayst', 'spake',
  // Archaic adverbs / discourse markers
  'methinks', 'methought', 'perchance', 'mayhaps', 'belike', 'prithee',
  'forsooth', 'verily', 'betwixt', 'amongst', 'whilst', 'ere',
  'hither', 'thither', 'yonder', 'yon', 'oft', 'ofttimes',
  'naught', 'aught', 'sooth', 'withal',
  // Archaic contractions
  'twas', 'tis', 'tween', 'twixt',
  // Archaic locative / temporal adverbs
  'morrow', 'wherefore', 'whence', 'henceforth', 'herewith', 'therewith',
  'thereunto', 'hereunto', 'thereof', 'therein', 'whereby',
  // Archaic exclamations
  'alack', 'alas', 'fie',
  // Archaic verbs (formal/poetic)
  'beseech', 'bestow', 'forsake', 'bespeak',
]);

/**
 * Words that mark distinctly contemporary / conversational register.
 * Their presence in fantasy/historical prose signals an anachronistic voice.
 */
const MODERN_MARKERS = new Set([
  // Contracted speech (informal)
  'gonna', 'wanna', 'gotta', 'kinda', 'sorta',
  // Contemporary affirmations/negations
  'yeah', 'yep', 'nope', 'ok', 'okay',
  // Contemporary filler / intensifiers
  'literally', 'basically', 'totally', 'definitely', 'seriously',
  'actually', 'anyways', 'whatever', 'super',
  // Contemporary social vocabulary
  'guys', 'dude', 'chill', 'vibe', 'awesome',
  // Digital-age vocabulary
  'internet', 'email', 'app', 'online', 'texted', 'hashtag', 'viral',
]);

/**
 * Atmosphere keyword categories.
 * Each word's presence contributes to that category's score.
 * A word may appear in multiple categories (e.g. "ancient" in both
 * mysterious and epic) — this reflects its genuine dual resonance.
 */
const ATMOSPHERE_SETS: Record<string, Set<string>> = {
  dark: new Set([
    'shadow', 'shadows', 'darkness', 'black', 'night', 'doom', 'dread',
    'death', 'despair', 'grim', 'bleak', 'fear', 'horror', 'terror',
    'gloom', 'abyss', 'malice', 'cursed', 'blight', 'wretched', 'dusk',
    'murk', 'sinister', 'ominous', 'foreboding', 'grave', 'gloomy',
    'dread', 'haunt', 'haunted', 'shadow', 'pale', 'hollow',
  ]),
  hopeful: new Set([
    'light', 'hope', 'dawn', 'bright', 'golden', 'warmth', 'warm', 'joy',
    'peace', 'bloom', 'spring', 'rise', 'gleam', 'radiant', 'promise',
    'morning', 'salvation', 'triumph', 'renewed', 'grace', 'sanctuary',
    'blessing', 'gentle', 'smile', 'laughter', 'serene', 'tranquil',
    'glimmer', 'alive', 'flourish',
  ]),
  violent: new Set([
    'blood', 'war', 'battle', 'fight', 'strike', 'wound', 'kill', 'crush',
    'shatter', 'rage', 'fury', 'clash', 'slash', 'pierce', 'steel', 'fallen',
    'slaughter', 'carnage', 'brutal', 'savage', 'blade', 'sword', 'arrow',
    'fist', 'blow', 'wrathful', 'combat', 'violence', 'smash', 'thrust',
    'cleave', 'gore', 'combat', 'siege', 'assault',
  ]),
  mysterious: new Set([
    'mist', 'fog', 'secret', 'hidden', 'ancient', 'whisper', 'whispers',
    'rune', 'runes', 'veil', 'unknown', 'riddle', 'omen', 'prophecy',
    'arcane', 'mystical', 'strange', 'enigma', 'forgotten', 'lost',
    'hallowed', 'eldritch', 'obscure', 'cryptic', 'fathomless', 'shrouded',
    'arcane', 'unseen', 'cursed', 'ominous', 'eerie',
  ]),
  romantic: new Set([
    'heart', 'love', 'tender', 'soft', 'kiss', 'embrace', 'longing',
    'desire', 'beautiful', 'beloved', 'passionate', 'fond', 'cherish',
    'devotion', 'affection', 'smitten', 'adore', 'yearning', 'breathless',
    'ardent', 'rapture', 'enchanted', 'blush', 'gaze', 'touched', 'warm',
    'swoon', 'trembling',
  ]),
  epic: new Set([
    'vast', 'mighty', 'great', 'legend', 'glory', 'eternal', 'power',
    'kingdom', 'quest', 'hero', 'destiny', 'throne', 'empire', 'immortal',
    'legendary', 'sovereign', 'champion', 'noble', 'divine', 'celestial',
    'ancient', 'grand', 'monumental', 'triumphant', 'heroic', 'valiant',
    'fate', 'oath', 'covenant',
  ]),
};

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export interface SentenceMetrics {
  /** Number of sentences detected. */
  count: number;
  /** Mean words per sentence (rounded to 1 decimal place). */
  avgLength: number;
  /** Standard deviation of sentence lengths (rounded to 1 decimal place). */
  stdDev: number;
  /** Qualitative category derived from avgLength and stdDev. */
  category: 'short' | 'medium' | 'long' | 'varied';
}

export interface VocabularyFlavor {
  /** Proportion of archaic words in total word count (0–1, 3 decimal places). */
  archaicScore: number;
  /** Proportion of modern markers in total word count (0–1, 3 decimal places). */
  modernScore: number;
  /** Dominant register derived from relative scores. */
  dominant: 'archaic' | 'modern' | 'mixed' | 'neutral';
  /** Top archaic words found, ranked by frequency. */
  topArchaicWords: string[];
  /** Top modern markers found, ranked by frequency. */
  topModernWords: string[];
}

export interface AtmosphereProfile {
  /**
   * Per-category frequency: occurrences per 100 words, rounded to 1 decimal.
   * All 6 categories are always present (score may be 0).
   */
  scores: Record<string, number>;
  /** Category with the highest score ('neutral' when all scores are 0). */
  dominant: string;
  /** Second-highest category, or null when fewer than 2 categories scored > 0. */
  secondary: string | null;
}

export interface StyleProfile {
  /** Unix timestamp (ms) when analysis was run. */
  analyzedAt: number;
  /** Number of word tokens analysed. */
  wordCount: number;
  sentences: SentenceMetrics;
  vocabulary: VocabularyFlavor;
  atmosphere: AtmosphereProfile;
  /**
   * Ready-to-inject constraint string for the LLM system prompt.
   * Example: "Write in a dark, mysterious, archaic voice with short, punchy
   * sentences (~9 words avg). Match the author's established style precisely."
   */
  styleConstraints: string;
}

// ---------------------------------------------------------------------------
// Text extraction helpers
// ---------------------------------------------------------------------------

// Common abbreviations that contain a period — shield them before sentence
// splitting so "Mr. Smith walked" is not split into two sentences.
const ABBR_RE =
  /\b(Mr|Mrs|Ms|Dr|Prof|Sr|Jr|St|vs|etc|Inc|Ltd|Corp|Fig|Vol|No|Dept|approx|est)\./g;
const SHIELD = '\u0000'; // null byte — never appears in prose

/**
 * Return the last `wordLimit` whitespace-delimited words from `text`.
 * Preserves sentence boundaries as much as possible by operating on the full
 * text first, then slicing by words.
 *
 * @param text       Plain text (not TipTap JSON).
 * @param wordLimit  Maximum words to return (default 2 000).
 */
export function extractLast2000Words(text: string, wordLimit = 2_000): string {
  const words = text.split(/\s+/).filter(Boolean);
  if (words.length <= wordLimit) return text.trim();
  return words.slice(-wordLimit).join(' ');
}

// ---------------------------------------------------------------------------
// Internal analysis helpers
// ---------------------------------------------------------------------------

/** Split prose into sentence strings, shielding common abbreviations. */
function splitIntoSentences(text: string): string[] {
  const shielded = text.replace(ABBR_RE, `$1${SHIELD}`);
  // Split on one or more sentence-ending marks, optionally followed by
  // closing quotes/brackets, then whitespace.
  const raw = shielded.split(/[.!?]+['"»\u201D\u2019]?\s+/);
  return raw
    .map((s) => s.replace(new RegExp(SHIELD, 'g'), '.').trim())
    .filter((s) => {
      // Discard chapter headings, single words, and other noise fragments.
      const wc = s.split(/\s+/).filter(Boolean).length;
      return wc >= 3;
    });
}

/** Word count for a single sentence string. */
function wordCount(sentence: string): number {
  return sentence.split(/\s+/).filter(Boolean).length;
}

/** Tokenise text into lowercase word tokens (≥ 2 chars, letters/hyphen/apostrophe). */
function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^\w\s'-]/g, ' ')
    .split(/\s+/)
    .filter((w) => w.length >= 2);
}

/** Top-N entries from a {word → count} map, descending. */
function topN(freq: Record<string, number>, n: number): string[] {
  return Object.entries(freq)
    .sort((a, b) => b[1] - a[1])
    .slice(0, n)
    .map(([w]) => w);
}

/** Round to a given number of decimal places. */
function round(v: number, places: number): number {
  const f = 10 ** places;
  return Math.round(v * f) / f;
}

// ---------------------------------------------------------------------------
// Style constraint string builder
// ---------------------------------------------------------------------------

function buildStyleConstraints(
  profile: Omit<StyleProfile, 'styleConstraints'>,
): string {
  // Tone phrase (up to 2 atmosphere categories)
  const tones: string[] = [];
  if (profile.atmosphere.dominant !== 'neutral') {
    tones.push(profile.atmosphere.dominant);
  }
  if (profile.atmosphere.secondary) {
    tones.push(profile.atmosphere.secondary);
  }
  const toneStr = tones.length > 0 ? tones.join(', ') : 'balanced';
  const article = /^[aeiou]/i.test(toneStr) ? 'an' : 'a';

  // Sentence structure phrase
  const structureLabel: Record<SentenceMetrics['category'], string> = {
    short: 'short, punchy sentences',
    medium: 'balanced, moderate-length sentences',
    long: 'flowing, elaborate sentences',
    varied: 'sentences varied in length for natural rhythm',
  };
  const structure = structureLabel[profile.sentences.category];
  const avgLen = `~${Math.round(profile.sentences.avgLength)} words avg`;

  // Vocabulary register note
  const flavorNote: Record<VocabularyFlavor['dominant'], string> = {
    archaic: ' Prefer elevated, archaic diction.',
    modern: ' Use contemporary, natural language.',
    mixed: ' Blend archaic and contemporary diction.',
    neutral: '',
  };
  const flavor = flavorNote[profile.vocabulary.dominant];

  return (
    `Write in ${article} ${toneStr} voice with ${structure} (${avgLen}).` +
    flavor +
    ' Match the author\'s established style precisely.'
  );
}

// ---------------------------------------------------------------------------
// Default profile (returned for empty / too-short text)
// ---------------------------------------------------------------------------

function defaultProfile(): StyleProfile {
  return {
    analyzedAt: Date.now(),
    wordCount: 0,
    sentences: { count: 0, avgLength: 0, stdDev: 0, category: 'medium' },
    vocabulary: {
      archaicScore: 0,
      modernScore: 0,
      dominant: 'neutral',
      topArchaicWords: [],
      topModernWords: [],
    },
    atmosphere: {
      scores: Object.fromEntries(Object.keys(ATMOSPHERE_SETS).map((k) => [k, 0])),
      dominant: 'neutral',
      secondary: null,
    },
    styleConstraints:
      "Write in a balanced voice with moderate-length sentences. Match the author's style.",
  };
}

// ---------------------------------------------------------------------------
// Main export
// ---------------------------------------------------------------------------

/**
 * Analyse `text` and return a StyleProfile.
 *
 * Pass the output of `extractLast2000Words()` for focused analysis of the
 * author's recent writing rather than the whole manuscript.
 *
 * Returns a neutral default profile when the text is too short (< 50 tokens)
 * to produce meaningful statistics.
 */
export function analyzeStyle(text: string): StyleProfile {
  if (!text.trim()) return defaultProfile();

  const tokens = tokenize(text);
  if (tokens.length < 50) return defaultProfile();

  // ── 1. Sentence metrics ──────────────────────────────────────────────────
  const sentences = splitIntoSentences(text);
  const lengths = sentences.map(wordCount);
  const total = lengths.length || 1;

  const avgSentenceLength = lengths.reduce((s, l) => s + l, 0) / total;
  const variance =
    lengths.reduce((s, l) => s + (l - avgSentenceLength) ** 2, 0) / total;
  const stdDev = Math.sqrt(variance);

  let sentenceCategory: SentenceMetrics['category'];
  if (total < 3) {
    sentenceCategory = 'medium'; // not enough data
  } else if (stdDev > avgSentenceLength * 0.55) {
    sentenceCategory = 'varied';
  } else if (avgSentenceLength < 12) {
    sentenceCategory = 'short';
  } else if (avgSentenceLength < 22) {
    sentenceCategory = 'medium';
  } else {
    sentenceCategory = 'long';
  }

  // ── 2. Vocabulary flavor ─────────────────────────────────────────────────
  const archaicFreq: Record<string, number> = {};
  const modernFreq: Record<string, number> = {};
  let archaicCount = 0;
  let modernCount = 0;

  for (const token of tokens) {
    if (ARCHAIC_WORDS.has(token)) {
      archaicCount++;
      archaicFreq[token] = (archaicFreq[token] ?? 0) + 1;
    }
    if (MODERN_MARKERS.has(token)) {
      modernCount++;
      modernFreq[token] = (modernFreq[token] ?? 0) + 1;
    }
  }

  const archaicRate = archaicCount / tokens.length;
  const modernRate = modernCount / tokens.length;

  // Dominant flavor: needs a minimum threshold (0.4 % of words) to register
  const THRESHOLD = 0.004;
  let dominant: VocabularyFlavor['dominant'];
  if (archaicRate >= THRESHOLD && modernRate >= THRESHOLD) {
    dominant =
      archaicRate > modernRate * 1.5
        ? 'archaic'
        : modernRate > archaicRate * 1.5
        ? 'modern'
        : 'mixed';
  } else if (archaicRate >= THRESHOLD) {
    dominant = 'archaic';
  } else if (modernRate >= THRESHOLD) {
    dominant = 'modern';
  } else {
    dominant = 'neutral';
  }

  // ── 3. Atmosphere ────────────────────────────────────────────────────────
  const rawScores: Record<string, number> = {};
  for (const [category, wordSet] of Object.entries(ATMOSPHERE_SETS)) {
    let hits = 0;
    for (const token of tokens) {
      if (wordSet.has(token)) hits++;
    }
    // Normalise to occurrences per 100 words
    rawScores[category] = round((hits / tokens.length) * 100, 1);
  }

  const sortedAtm = Object.entries(rawScores)
    .filter(([, score]) => score > 0)
    .sort((a, b) => b[1] - a[1]);

  const dominantMood = sortedAtm[0]?.[0] ?? 'neutral';
  const secondaryMood = sortedAtm[1]?.[0] ?? null;

  // ── 4. Assemble ──────────────────────────────────────────────────────────
  const partial: Omit<StyleProfile, 'styleConstraints'> = {
    analyzedAt: Date.now(),
    wordCount: tokens.length,
    sentences: {
      count: sentences.length,
      avgLength: round(avgSentenceLength, 1),
      stdDev: round(stdDev, 1),
      category: sentenceCategory,
    },
    vocabulary: {
      archaicScore: round(archaicRate, 3),
      modernScore: round(modernRate, 3),
      dominant,
      topArchaicWords: topN(archaicFreq, 5),
      topModernWords: topN(modernFreq, 5),
    },
    atmosphere: {
      scores: rawScores,
      dominant: dominantMood,
      secondary: secondaryMood,
    },
  };

  return { ...partial, styleConstraints: buildStyleConstraints(partial) };
}
