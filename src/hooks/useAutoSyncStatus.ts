import { useState, useEffect } from 'react';
import {
  subscribeToSyncStatus,
  getSyncState,
  type SyncState,
} from '../services/autoSyncService';

export function useAutoSyncStatus(): SyncState {
  const [state, setState] = useState<SyncState>(getSyncState);
  useEffect(() => subscribeToSyncStatus(setState), []);
  return state;
}
