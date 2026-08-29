/**
 * authStore — Zustand store for Supabase auth state.
 *
 * Auth is fully optional. When Supabase is not configured
 * (missing env vars) all state stays null and the app works
 * identically to the logged-out state.
 *
 * Usage:
 *   const { user, profile, signIn, signOut } = useAuthStore();
 */

import { create } from 'zustand';
import type { User, Session } from '@supabase/supabase-js';
import { supabase, type Profile } from '../lib/supabase';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type AuthStatus = 'loading' | 'authenticated' | 'unauthenticated';

interface AuthState {
  status: AuthStatus;
  user: User | null;
  session: Session | null;
  profile: Profile | null;

  // Actions
  init: () => void;
  signIn: (email: string, password: string) => Promise<string | null>;
  signUp: (email: string, password: string, displayName: string) => Promise<string | null>;
  signOut: () => Promise<void>;
  refreshProfile: () => Promise<void>;
  updateDisplayName: (name: string) => Promise<string | null>;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function fetchProfile(userId: string): Promise<Profile | null> {
  if (!supabase) return null;
  const { data, error } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', userId)
    .single();
  if (error) return null;
  return data as Profile;
}

// ---------------------------------------------------------------------------
// Store
// ---------------------------------------------------------------------------

export const useAuthStore = create<AuthState>((set, get) => ({
  status: 'loading',
  user: null,
  session: null,
  profile: null,

  // ── init ──────────────────────────────────────────────────────────────────
  // Call once at app startup (in AppShell). Restores session from storage and
  // subscribes to auth state changes for the lifetime of the app.
  init: () => {
    if (!supabase) {
      set({ status: 'unauthenticated' });
      return;
    }

    // Restore existing session
    supabase.auth.getSession().then(async ({ data: { session } }) => {
      if (session?.user) {
        const profile = await fetchProfile(session.user.id);
        set({ status: 'authenticated', user: session.user, session, profile });
      } else {
        set({ status: 'unauthenticated' });
      }
    });

    // Listen for sign-in / sign-out events
    supabase.auth.onAuthStateChange(async (_event, session) => {
      if (session?.user) {
        const profile = await fetchProfile(session.user.id);
        set({ status: 'authenticated', user: session.user, session, profile });
      } else {
        set({ status: 'unauthenticated', user: null, session: null, profile: null });
      }
    });
  },

  // ── signIn ────────────────────────────────────────────────────────────────
  signIn: async (email, password) => {
    if (!supabase) return 'Supabase is not configured.';
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    return error ? error.message : null;
  },

  // ── signUp ────────────────────────────────────────────────────────────────
  signUp: async (email, password, displayName) => {
    if (!supabase) return 'Supabase is not configured.';
    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: { data: { display_name: displayName } },
    });
    return error ? error.message : null;
  },

  // ── signOut ───────────────────────────────────────────────────────────────
  signOut: async () => {
    if (!supabase) return;
    await supabase.auth.signOut();
    set({ status: 'unauthenticated', user: null, session: null, profile: null });
  },

  // ── refreshProfile ────────────────────────────────────────────────────────
  refreshProfile: async () => {
    const { user } = get();
    if (!user) return;
    const profile = await fetchProfile(user.id);
    if (profile) set({ profile });
  },

  // ── updateDisplayName ─────────────────────────────────────────────────────
  updateDisplayName: async (name) => {
    if (!supabase) return 'Supabase is not configured.';
    const { user } = get();
    if (!user) return 'Not signed in.';
    const { error } = await supabase
      .from('profiles')
      .update({ display_name: name })
      .eq('id', user.id);
    if (error) return error.message;
    await get().refreshProfile();
    return null;
  },
}));
