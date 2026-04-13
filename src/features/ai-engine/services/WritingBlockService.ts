/**
 * WritingBlockService
 *
 * Pure stateful class that monitors an author's word-count time-series and
 * returns the current "block" state.  No React, no DOM — just numbers and
 * time.
 *
 * Two patterns are detected:
 *
 *   IDLE      — The author has not produced any editor activity for at least
 *               IDLE_MS milliseconds during an active session.  An "active
 *               session" means at least one recordActivity() call has been
 *               made since the last reset().
 *
 *   THRASHING — Inside a rolling WINDOW_MS window the author added at least
 *               MIN_GROSS_WORDS words (gross additions), yet the net word
 *               count change is less than THRASH_NET_RATIO × grossAdditions.
 *               Classic write-delete loop: typing then backspacing in circles.
 *
 * Usage
 * ─────
 *   const svc = new WritingBlockService();
 *
 *   // Call on every TipTap onUpdate:
 *   svc.recordActivity(editor.storage.characterCount.words());
 *
 *   // Poll on an interval to read state:
 *   const state = svc.getState(currentWordCount);
 *
 *   // Reset when the author switches to a new scene:
 *   svc.reset();
 */

export interface BlockDetectionState {
  /** Null means no block detected. */
  type: 'idle' | 'thrashing' | null;
  /** Seconds elapsed since last activity (only meaningful when type === 'idle'). */
  idleSeconds: number;
}

interface Snapshot {
  ts: number;
  words: number;
}

export class WritingBlockService {
  // ── Thresholds ─────────────────────────────────────────────────────────────

  /** No-activity window before we call it idle (ms). */
  private readonly IDLE_MS = 5 * 60_000; // 5 minutes

  /** Rolling window used for thrash detection (ms). */
  private readonly WINDOW_MS = 90_000; // 90 seconds

  /** Min gross word additions in the window before we bother checking thrash. */
  private readonly MIN_GROSS_WORDS = 25;

  /**
   * If net word gain is less than this fraction of gross additions, it's a
   * thrash loop.  0.25 means "kept less than 25% of what you typed".
   */
  private readonly THRASH_NET_RATIO = 0.25;

  /** Minimum snapshots required before thrash analysis is meaningful. */
  private readonly MIN_SNAPSHOTS = 6; // 6 × 5 s = 30 s of data

  // ── State ──────────────────────────────────────────────────────────────────

  private snapshots: Snapshot[] = [];
  private lastActivityAt = Date.now();
  private sessionHasActivity = false;

  // ── Public API ─────────────────────────────────────────────────────────────

  /**
   * Call this every time the editor content changes (TipTap onUpdate).
   * Records the current word count with a timestamp and prunes old snapshots.
   */
  recordActivity(wordCount: number): void {
    this.lastActivityAt = Date.now();
    this.sessionHasActivity = true;

    const now = Date.now();
    this.snapshots.push({ ts: now, words: wordCount });

    // Keep only snapshots within the rolling window
    const cutoff = now - this.WINDOW_MS;
    this.snapshots = this.snapshots.filter((s) => s.ts >= cutoff);
  }

  /**
   * Returns the current block detection state.
   * Call this on a slow polling interval (e.g. every 5 seconds).
   *
   * @param currentWordCount  Latest word count from the editor.
   */
  getState(currentWordCount: number): BlockDetectionState {
    const now = Date.now();
    const idleMs = now - this.lastActivityAt;

    // ── Idle check ───────────────────────────────────────────────────────────
    // Only fire if the author has actually been writing this session.
    if (this.sessionHasActivity && idleMs >= this.IDLE_MS) {
      return { type: 'idle', idleSeconds: Math.floor(idleMs / 1000) };
    }

    // ── Thrash check ─────────────────────────────────────────────────────────
    // Need enough history to make a meaningful call.
    if (this.snapshots.length >= this.MIN_SNAPSHOTS) {
      const oldest = this.snapshots[0];
      const netChange = currentWordCount - oldest.words;

      // Sum every positive delta inside the window = gross additions
      let grossAdditions = 0;
      for (let i = 1; i < this.snapshots.length; i++) {
        const delta = this.snapshots[i].words - this.snapshots[i - 1].words;
        if (delta > 0) grossAdditions += delta;
      }

      if (
        grossAdditions >= this.MIN_GROSS_WORDS &&
        netChange < grossAdditions * this.THRASH_NET_RATIO
      ) {
        return { type: 'thrashing', idleSeconds: 0 };
      }
    }

    return { type: null, idleSeconds: 0 };
  }

  /**
   * Reset all state.  Call when the author navigates to a new scene so the
   * detector starts fresh.
   */
  reset(): void {
    this.snapshots = [];
    this.lastActivityAt = Date.now();
    this.sessionHasActivity = false;
  }
}
