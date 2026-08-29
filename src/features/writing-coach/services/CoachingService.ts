/**
 * CoachingService — builds all prompt messages for the Meyvn Writing Coach.
 *
 * Core principle: the coach NEVER corrects. It observes, questions, hints,
 * and guides the author to discover and fix problems themselves.
 *
 * The author owns every word. Meyvn owns the questions.
 */

import type { OllamaMessage } from '../../ai-engine/services/OllamaService';
import type { WriterProfile, SkillLevel } from '../../../types/writerProfile';

// ---------------------------------------------------------------------------
// Coaching categories + subcategories
// ---------------------------------------------------------------------------

export interface CoachSubcategory {
  id: string;
  label: string;
  skillKey: keyof WriterProfile['skills'];
  description: string;
}

export interface CoachCategoryDef {
  id: string;
  label: string;
  icon: string;
  color: string;
  subcategories: CoachSubcategory[];
}

export const COACH_CATEGORIES: CoachCategoryDef[] = [
  {
    id: 'fundamentals',
    label: 'Writing Fundamentals',
    icon: 'PenLine',
    color: 'violet',
    subcategories: [
      { id: 'sentence-construction', label: 'Sentence Construction', skillKey: 'sentenceStructure', description: 'Build clear, complete sentences' },
      { id: 'sentence-variety', label: 'Sentence Variety', skillKey: 'sentenceVariety', description: 'Mix sentence length and structure' },
      { id: 'paragraph-structure', label: 'Paragraph Structure', skillKey: 'paragraphStructure', description: 'Organize ideas into effective paragraphs' },
      { id: 'word-choice', label: 'Word Choice', skillKey: 'vocabulary', description: 'Choose precise, vivid words' },
    ],
  },
  {
    id: 'grammar',
    label: 'Grammar',
    icon: 'BookOpen',
    color: 'blue',
    subcategories: [
      { id: 'verb-tense', label: 'Verb Tense', skillKey: 'verbTense', description: 'Use tense consistently and correctly' },
      { id: 'verb-form', label: 'Verb Form', skillKey: 'verbForm', description: 'Form verbs correctly' },
      { id: 'subject-verb-agreement', label: 'Subject–Verb Agreement', skillKey: 'subjectVerbAgreement', description: 'Match subjects and verbs' },
    ],
  },
  {
    id: 'punctuation',
    label: 'Punctuation',
    icon: 'Pen',
    color: 'amber',
    subcategories: [
      { id: 'commas', label: 'Commas', skillKey: 'punctuation', description: 'Use commas at the right moments' },
      { id: 'apostrophes', label: 'Apostrophes', skillKey: 'punctuation', description: 'Possession and contractions' },
      { id: 'dialogue-punctuation', label: 'Dialogue Punctuation', skillKey: 'dialogue', description: 'Punctuate speech correctly' },
    ],
  },
  {
    id: 'fiction',
    label: 'Fiction Writing',
    icon: 'Sparkles',
    color: 'teal',
    subcategories: [
      { id: 'description', label: 'Description & Setting', skillKey: 'description', description: 'Make worlds vivid and real' },
      { id: 'dialogue', label: 'Dialogue', skillKey: 'dialogue', description: 'Write natural, revealing conversation' },
      { id: 'character', label: 'Character Development', skillKey: 'characterDevelopment', description: 'Build characters readers remember' },
      { id: 'pacing', label: 'Pacing & Tension', skillKey: 'pacing', description: 'Control the speed and energy of your story' },
    ],
  },
];

// ---------------------------------------------------------------------------
// Persona
// ---------------------------------------------------------------------------

function coachPersona(profile: WriterProfile | null): string {
  const isYoung = profile?.age !== undefined && profile.age < 16;
  const grade = profile?.grade;
  const gradeNote = grade ? `The learner is in grade ${grade}.` : '';

  const tone = isYoung
    ? 'Use warm, encouraging, age-appropriate language. Keep explanations short and clear. Use simple vocabulary.'
    : 'Use a collegial, mentoring tone. Be direct and precise. Treat the writer as a fellow author.';

  return `You are Meyvn — a writing mentor and coach.
Your role is to help writers improve their craft through guided discovery, not correction.

${tone}
${gradeNote}

SACRED RULES:
1. Never rewrite the learner's sentence. Never provide the corrected version unless they have struggled through three full hints.
2. Always acknowledge what they got RIGHT before identifying what needs work.
3. Ask questions. Guide. Hint. Never tell them the answer on the first try.
4. Use the writer's interests and genre preferences when generating examples.
5. Stay encouraging. Frustration is normal. Celebrate the attempt.
6. If they ask "just tell me," remind them gently that discovering the answer themselves will make it stick.

You are the companion. They own the story.`;
}

// ---------------------------------------------------------------------------
// Exercise generation
// ---------------------------------------------------------------------------

export interface ExerciseOpts {
  subcategory: CoachSubcategory;
  skillLevel: SkillLevel;
  profile: WriterProfile | null;
}

export class CoachingService {

  static buildExerciseMessages(opts: ExerciseOpts): OllamaMessage[] {
    const { subcategory, skillLevel, profile } = opts;
    const interests = profile?.interests ?? {};

    const genreHint = interests.favoriteGenres?.length
      ? `The learner loves: ${interests.favoriteGenres.join(', ')}.`
      : '';
    const hobbyHint = interests.hobbies?.length
      ? `Their hobbies include: ${interests.hobbies.join(', ')}.`
      : '';
    const storyHint = interests.favoriteStory
      ? `Their favourite story is "${interests.favoriteStory}".`
      : '';

    const difficultyNote: Record<SkillLevel, string> = {
      'needs-practice': 'Keep the exercise simple. Short, clear sentences. One concept at a time.',
      developing: 'Use moderately complex sentences. Introduce one layer of nuance.',
      strong: 'Challenge them with more complex constructions or subtle distinctions.',
      excellent: 'Give them a professional-level challenge. Expect sophisticated reasoning.',
    };

    const system = coachPersona(profile);

    const user = `Create a writing exercise focused on: **${subcategory.label}**

Context about this learner:
${genreHint}
${hobbyHint}
${storyHint}

Difficulty: ${skillLevel} — ${difficultyNote[skillLevel]}

Instructions for your response:
1. Write a short, engaging scenario or sentence drawn from the learner's interests (1–3 sentences).
2. Give a clear task instruction that targets ${subcategory.label}.
3. Add one example of what NOT to do (without telling them WHY — let them discover).
4. Do NOT provide the answer or the correction.
5. End with a single guiding question that focuses their attention.

Format:
**Your scenario:** [scenario text]
**Your task:** [what they need to do]
**Watch out for:** [subtle wrong example to avoid, but don't explain why]
**Meyvn asks:** [single question to focus their thinking]`;

    return [
      { role: 'system', content: system },
      { role: 'user', content: user },
    ];
  }

  // ---------------------------------------------------------------------------
  // Three-stage hint system
  // ---------------------------------------------------------------------------

  static buildHintMessages(opts: {
    exercise: string;
    userAttempt: string;
    hintStage: 1 | 2 | 3;
    subcategory: CoachSubcategory;
    profile: WriterProfile | null;
  }): OllamaMessage[] {
    const { exercise, userAttempt, hintStage, subcategory, profile } = opts;

    const hintInstructions: Record<number, string> = {
      1: `Stage 1 — Observation only.
Ask the learner to look again. Point to the GENERAL area of the issue without naming the specific problem.
Example: "I notice something in this part. Read it aloud — does anything feel off?"
Do NOT name the error. Do NOT explain. Just guide their attention.`,

      2: `Stage 2 — Guided hint.
Name the CATEGORY of the issue (e.g. verb tense, comma placement, subject agreement) but do NOT give the answer.
Example: "Take a close look at the verb. Think about when this action is happening."
Still no correction. Ask a more specific question.`,

      3: `Stage 3 — Conceptual explanation.
Explain the underlying RULE or CONCEPT, still without rewriting their sentence.
Walk them through the reasoning. After explaining, give them one more chance to self-correct.
Only if they explicitly say they give up, you may show the corrected form — but always explain WHY it is correct.`,
    };

    const system = coachPersona(profile);

    const user = `Topic: ${subcategory.label}

Original exercise:
${exercise}

Learner's attempt:
${userAttempt}

This is hint stage ${hintStage}.
${hintInstructions[hintStage]}

Respond as Meyvn. Be warm and specific. Remember: you see what is RIGHT in their attempt too — mention it.`;

    return [
      { role: 'system', content: system },
      { role: 'user', content: user },
    ];
  }

  // ---------------------------------------------------------------------------
  // Evaluation (non-corrective — called on successful attempt)
  // ---------------------------------------------------------------------------

  static buildEvaluationMessages(opts: {
    exercise: string;
    userAttempt: string;
    subcategory: CoachSubcategory;
    profile: WriterProfile | null;
  }): OllamaMessage[] {
    const { exercise, userAttempt, subcategory, profile } = opts;

    const system = coachPersona(profile);

    const user = `Topic: ${subcategory.label}

Original exercise:
${exercise}

Learner's attempt:
${userAttempt}

Evaluate this attempt:
1. First, identify what they got RIGHT. Be specific and genuine — not generic praise.
2. If there are issues, point them out WITHOUT rewriting. Ask a question to guide self-correction.
3. If the attempt is strong, celebrate and explain WHY it works — reinforce the concept.
4. End with a brief note about what skill they demonstrated or need to keep practising.

Do NOT correct by rewriting. Coach by asking.`;

    return [
      { role: 'system', content: system },
      { role: 'user', content: user },
    ];
  }

  // ---------------------------------------------------------------------------
  // Personalised prompt generation (for the "Write" section)
  // ---------------------------------------------------------------------------

  static buildPromptMessages(opts: {
    subcategory: CoachSubcategory;
    profile: WriterProfile | null;
  }): OllamaMessage[] {
    const { subcategory, profile } = opts;
    const interests = profile?.interests ?? {};

    const system = coachPersona(profile);

    const user = `Generate a single writing prompt tailored to the learner that will naturally require them to practise: **${subcategory.label}**

Their interests: ${[
  interests.favoriteGenres?.join(', '),
  interests.hobbies?.join(', '),
  interests.favoriteStory,
].filter(Boolean).join(' | ') || 'general fiction'}

Rules:
- The prompt should be genuinely interesting to this person.
- It should feel like an invitation to explore, NOT a grammar exercise.
- The focus skill (${subcategory.label}) should arise naturally from the scenario.
- Keep it under 60 words.
- No meta-commentary about grammar or skill.
- End with a single question or open invitation.`;

    return [
      { role: 'system', content: system },
      { role: 'user', content: user },
    ];
  }
}
