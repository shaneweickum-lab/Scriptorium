export type SkillLevel = 'needs-practice' | 'developing' | 'strong' | 'excellent';

export type CoachCategory =
  | 'fundamentals'
  | 'grammar'
  | 'punctuation'
  | 'fiction';

export interface SkillProfile {
  sentenceStructure: SkillLevel;
  sentenceVariety: SkillLevel;
  paragraphStructure: SkillLevel;
  verbTense: SkillLevel;
  verbForm: SkillLevel;
  subjectVerbAgreement: SkillLevel;
  punctuation: SkillLevel;
  vocabulary: SkillLevel;
  dialogue: SkillLevel;
  description: SkillLevel;
  characterDevelopment: SkillLevel;
  pacing: SkillLevel;
}

export interface WritingInterests {
  favoriteStory?: string;
  favoriteGenres?: string[];
  favoriteCharacters?: string;
  hobbies?: string[];
  subjects?: string[];
  writingGoal?: string;
}

export interface WriterProfile {
  id: 'primary';
  /** Age in years (used to calibrate explanation vocabulary). */
  age?: number;
  /** School grade, 1-12. Undefined for adults. */
  grade?: number;
  interests: WritingInterests;
  skills: SkillProfile;
  /** Number of exercises attempted per skill key. */
  exerciseCounts: Partial<Record<keyof SkillProfile, number>>;
  coachEnabled: boolean;
  onboardingComplete: boolean;
  createdAt: number;
  updatedAt: number;
}

export const DEFAULT_SKILLS: SkillProfile = {
  sentenceStructure: 'developing',
  sentenceVariety: 'developing',
  paragraphStructure: 'developing',
  verbTense: 'developing',
  verbForm: 'developing',
  subjectVerbAgreement: 'developing',
  punctuation: 'developing',
  vocabulary: 'developing',
  dialogue: 'developing',
  description: 'developing',
  characterDevelopment: 'developing',
  pacing: 'developing',
};

export const SKILL_LABEL: Record<keyof SkillProfile, string> = {
  sentenceStructure: 'Sentence Structure',
  sentenceVariety: 'Sentence Variety',
  paragraphStructure: 'Paragraph Structure',
  verbTense: 'Verb Tense',
  verbForm: 'Verb Form',
  subjectVerbAgreement: 'Subject–Verb Agreement',
  punctuation: 'Punctuation',
  vocabulary: 'Vocabulary',
  dialogue: 'Dialogue',
  description: 'Description',
  characterDevelopment: 'Character Development',
  pacing: 'Pacing',
};

export const SKILL_LEVEL_LABEL: Record<SkillLevel, string> = {
  'needs-practice': 'Needs Practice',
  developing: 'Developing',
  strong: 'Strong',
  excellent: 'Excellent',
};

export const SKILL_LEVEL_COLOR: Record<SkillLevel, string> = {
  'needs-practice': 'text-amber-600',
  developing: 'text-blue-600',
  strong: 'text-violet-600',
  excellent: 'text-teal-600',
};
