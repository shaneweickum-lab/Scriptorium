/**
 * useWritingBlock
 *
 * Wraps WritingBlockService with React lifecycle.  Pass the TipTap editor
 * instance and the current node id; the hook wires itself to editor events
 * and a polling timer, then surfaces a block type and dismiss action.
 *
 * Usage
 * ─────
 *   const { blockType, idleMinutes, dismiss } = useWritingBlock(editor, nodeId);
 *
 * blockType is:
 *   null        — no block detected, render nothing
 *   'idle'      — author has been inactive for 5+ minutes
 *   'thrashing' — write-delete loop detected
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import type { Editor } from '@tiptap/react';
import { WritingBlockService } from '../services/WritingBlockService';

/** How often the hook polls the service for updated state (ms). */
const POLL_INTERVAL_MS = 5_000;

/** After dismissing, how long before the detector can fire again (ms). */
const DISMISS_COOLDOWN_MS = 10 * 60_000; // 10 minutes

export interface UseWritingBlockReturn {
  /** The detected block type, or null when the author is writing freely. */
  blockType: 'idle' | 'thrashing' | null;
  /** How many full minutes the author has been idle (only set when type==='idle'). */
  idleMinutes: number;
  /** Dismiss the card.  Automatically re-arms after DISMISS_COOLDOWN_MS. */
  dismiss: () => void;
}

export function useWritingBlock(
  editor: Editor | null,
  nodeId: string | undefined,
): UseWritingBlockReturn {
  const serviceRef = useRef(new WritingBlockService());
  const dismissedRef = useRef(false);
  const cooldownTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [blockType, setBlockType] = useState<'idle' | 'thrashing' | null>(null);
  const [idleMinutes, setIdleMinutes] = useState(0);

  // ── Reset whenever the author switches to a different node ────────────────
  useEffect(() => {
    serviceRef.current.reset();
    setBlockType(null);
    setIdleMinutes(0);
    dismissedRef.current = false;
    if (cooldownTimerRef.current) {
      clearTimeout(cooldownTimerRef.current);
      cooldownTimerRef.current = null;
    }
  }, [nodeId]);

  // ── Wire up TipTap activity events ────────────────────────────────────────
  useEffect(() => {
    if (!editor) return;

    const handler = () => {
      const words = (editor.storage.characterCount as { words: () => number } | undefined)?.words() ?? 0;
      serviceRef.current.recordActivity(words);

      // As soon as the author types again, immediately clear any idle card.
      // (Thrash state persists until the poll re-evaluates — intentional.)
      setBlockType((prev) => (prev === 'idle' ? null : prev));
    };

    editor.on('update', handler);
    return () => {
      editor.off('update', handler);
    };
  }, [editor]);

  // ── Polling timer — re-evaluates block state every POLL_INTERVAL_MS ───────
  useEffect(() => {
    if (!editor) return;

    const tick = () => {
      if (dismissedRef.current) return;
      const words = (editor.storage.characterCount as { words: () => number } | undefined)?.words() ?? 0;
      const state = serviceRef.current.getState(words);

      setBlockType(state.type);
      if (state.type === 'idle') {
        setIdleMinutes(Math.floor(state.idleSeconds / 60));
      }
    };

    const interval = setInterval(tick, POLL_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [editor]);

  // ── Dismiss ───────────────────────────────────────────────────────────────
  const dismiss = useCallback(() => {
    setBlockType(null);
    dismissedRef.current = true;

    // Re-arm the detector after the cooldown period
    if (cooldownTimerRef.current) clearTimeout(cooldownTimerRef.current);
    cooldownTimerRef.current = setTimeout(() => {
      dismissedRef.current = false;
      // Also reset thrash history so the next detection window is fresh
      serviceRef.current.reset();
      cooldownTimerRef.current = null;
    }, DISMISS_COOLDOWN_MS);
  }, []);

  return { blockType, idleMinutes, dismiss };
}
