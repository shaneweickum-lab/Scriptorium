import { readFileSync, writeFileSync, watch } from 'node:fs';
import type { ScriptoriumSync, PendingWrite } from './types.js';

let syncPath = '';
let cached: ScriptoriumSync | null = null;

export function initReader(path: string): void {
  syncPath = path;
  reload();

  watch(path, { persistent: false }, (event) => {
    if (event === 'change') reload();
  });
}

function reload(): void {
  try {
    cached = JSON.parse(readFileSync(syncPath, 'utf-8')) as ScriptoriumSync;
  } catch {
    // file not ready yet or malformed — keep the last good read
  }
}

export function getSync(): ScriptoriumSync | null {
  return cached;
}

export function queuePendingWrite(write: PendingWrite): void {
  if (!cached) throw new Error('Sync file not loaded');
  const updated: ScriptoriumSync = {
    ...cached,
    pending_writes: [...(cached.pending_writes ?? []), write],
  };
  writeFileSync(syncPath, JSON.stringify(updated, null, 2), 'utf-8');
  cached = updated;
}
