/**
 * ChunkingService — splits plain text into overlapping token-approximate segments.
 *
 * all-MiniLM-L6-v2 uses WordPiece tokenisation. We approximate token count
 * using the ratio 1 token ≈ 0.75 words (i.e. ~1.33 tokens per word), which is
 * accurate to within ~10 % for English prose.
 *
 * Default window: 512 tokens (~384 words) with 50-token (~38-word) overlap.
 * Chunks are split on whitespace boundaries so no word is cut mid-stream.
 */

export interface TextChunk {
  /** Zero-based index of this chunk within its source. */
  chunkIndex: number;
  /** The chunk text ready for embedding. */
  text: string;
  /** Approximate start token offset in the source. */
  startTokenApprox: number;
  /** Approximate end token offset in the source. */
  endTokenApprox: number;
}

const TOKENS_PER_WORD = 1.33;

function wordsToTokens(words: number): number {
  return Math.round(words * TOKENS_PER_WORD);
}

function tokensToWords(tokens: number): number {
  return Math.round(tokens / TOKENS_PER_WORD);
}

/**
 * Split `text` into overlapping chunks.
 *
 * @param text          Plain text to split (not TipTap JSON).
 * @param maxTokens     Maximum tokens per chunk (default 512).
 * @param overlapTokens Tokens shared between adjacent chunks (default 50).
 * @returns             Array of chunks; returns a single chunk if the text
 *                      fits within `maxTokens`.
 */
export function chunkText(
  text: string,
  maxTokens = 512,
  overlapTokens = 50,
): TextChunk[] {
  const words = text.split(/\s+/).filter(Boolean);
  if (words.length === 0) return [];

  const windowWords = tokensToWords(maxTokens);
  const overlapWords = tokensToWords(overlapTokens);
  const stepWords = Math.max(1, windowWords - overlapWords);

  // If it fits in one chunk, return immediately — no unnecessary splitting.
  if (words.length <= windowWords) {
    return [
      {
        chunkIndex: 0,
        text: words.join(' '),
        startTokenApprox: 0,
        endTokenApprox: wordsToTokens(words.length),
      },
    ];
  }

  const chunks: TextChunk[] = [];
  let start = 0;

  while (start < words.length) {
    const end = Math.min(start + windowWords, words.length);
    const chunkWords = words.slice(start, end);

    chunks.push({
      chunkIndex: chunks.length,
      text: chunkWords.join(' '),
      startTokenApprox: wordsToTokens(start),
      endTokenApprox: wordsToTokens(end),
    });

    if (end >= words.length) break;
    start += stepWords;
  }

  return chunks;
}

/**
 * Estimate the approximate token count of a plain-text string.
 * Useful for deciding whether a passage needs chunking before embedding.
 */
export function estimateTokenCount(text: string): number {
  const words = text.split(/\s+/).filter(Boolean).length;
  return wordsToTokens(words);
}
