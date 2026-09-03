/**
 * Supabase client singleton.
 *
 * Reads credentials from Vite env variables — set these in .env.local:
 *   VITE_SUPABASE_URL=https://your-project-ref.supabase.co
 *   VITE_SUPABASE_ANON_KEY=your-anon-key-here
 *
 * When env vars are missing the client is null and all auth/backup features
 * degrade silently — the app remains fully functional offline.
 */

import { createClient, type SupabaseClient } from '@supabase/supabase-js';

const url  = import.meta.env.VITE_SUPABASE_URL  as string | undefined;
const key  = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

export const supabase: SupabaseClient | null =
  url && key ? createClient(url, key) : null;

export const isSupabaseConfigured = !!supabase;

// ---------------------------------------------------------------------------
// Database row types (mirror supabase/schema.sql)
// ---------------------------------------------------------------------------

export interface Profile {
  id: string;
  display_name: string | null;
  plan: 'free' | 'pro';
  plan_expires_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface BookBackupRow {
  id: string;
  user_id: string;
  local_id: string;
  title: string;
  author: string | null;
  word_count: number;
  data: BookBackupData;
  content_updated_at: number;
  backed_up_at: string;
  created_at: string;
}

export interface BookBackupData {
  book: Record<string, unknown>;
  writingNodes: Record<string, unknown>[];
  worldSections: Record<string, unknown>[];
  worldEntries: Record<string, unknown>[];
  assembly: Record<string, unknown> | null;
}

export interface UsageEventInsert {
  user_id: string;
  event: string;
  data?: Record<string, unknown>;
}
