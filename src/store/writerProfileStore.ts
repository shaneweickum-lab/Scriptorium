import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { WriterProfile, SkillLevel, WritingInterests } from '../types/writerProfile';
import { DEFAULT_SKILLS } from '../types/writerProfile';

interface WriterProfileState {
  profile: WriterProfile | null;
  initProfile: () => void;
  updateInterests: (interests: Partial<WritingInterests>) => void;
  updateAge: (age: number, grade?: number) => void;
  setOnboardingComplete: () => void;
  setCoachEnabled: (enabled: boolean) => void;
  updateSkill: (skill: keyof WriterProfile['skills'], level: SkillLevel) => void;
  recordExercise: (skill: keyof WriterProfile['skills']) => void;
  resetProfile: () => void;
}

function makeDefaultProfile(): WriterProfile {
  return {
    id: 'primary',
    interests: {},
    skills: { ...DEFAULT_SKILLS },
    exerciseCounts: {},
    coachEnabled: true,
    onboardingComplete: false,
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };
}

export const useWriterProfileStore = create<WriterProfileState>()(
  persist(
    (set, get) => ({
      profile: null,

      initProfile: () => {
        if (!get().profile) set({ profile: makeDefaultProfile() });
      },

      updateInterests: (interests) =>
        set((s) => s.profile
          ? { profile: { ...s.profile, interests: { ...s.profile.interests, ...interests }, updatedAt: Date.now() } }
          : s
        ),

      updateAge: (age, grade) =>
        set((s) => s.profile
          ? { profile: { ...s.profile, age, grade, updatedAt: Date.now() } }
          : s
        ),

      setOnboardingComplete: () =>
        set((s) => s.profile
          ? { profile: { ...s.profile, onboardingComplete: true, updatedAt: Date.now() } }
          : s
        ),

      setCoachEnabled: (enabled) =>
        set((s) => s.profile
          ? { profile: { ...s.profile, coachEnabled: enabled, updatedAt: Date.now() } }
          : s
        ),

      updateSkill: (skill, level) =>
        set((s) => s.profile
          ? { profile: { ...s.profile, skills: { ...s.profile.skills, [skill]: level }, updatedAt: Date.now() } }
          : s
        ),

      recordExercise: (skill) =>
        set((s) => {
          if (!s.profile) return s;
          const counts = { ...s.profile.exerciseCounts };
          counts[skill] = (counts[skill] ?? 0) + 1;
          return { profile: { ...s.profile, exerciseCounts: counts, updatedAt: Date.now() } };
        }),

      resetProfile: () => set({ profile: makeDefaultProfile() }),
    }),
    { name: 'wp_writer_profile' }
  )
);
