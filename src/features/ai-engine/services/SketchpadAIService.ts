export type SketchpadAIMode = 'Expand' | 'Brainstorm' | 'Connect' | 'Challenge' | 'Boost' | 'Compress' | 'Generate';

type Message = { role: 'system' | 'user' | 'assistant'; content: string };

const MENTOR_SYSTEM = `You are a creative writing mentor helping a fiction author develop story ideas. Be specific, imaginative, and concise. Never be generic. Speak as a warm, encouraging collaborator.`;

const MODE_CONFIGS: Record<SketchpadAIMode, { system: string; userPrompt: (category: string, idea: string, context: string) => string }> = {
  Expand: {
    system: `${MENTOR_SYSTEM} Expand raw ideas into rich, evocative descriptions. Write 2-3 developed paragraphs full of concrete detail. Stay encouraging.`,
    userPrompt: (cat, idea, ctx) => `Expand this ${cat} idea into a rich, developed concept:\n\n"${idea}"${ctx}`,
  },
  Brainstorm: {
    system: `${MENTOR_SYSTEM} Generate creative spin-offs and related possibilities. Give 5-7 distinct ideas as a numbered list, each 1-2 vivid sentences.`,
    userPrompt: (cat, idea, ctx) => `Brainstorm 5-7 related ideas and variations for this ${cat} concept:\n\n"${idea}"${ctx}`,
  },
  Connect: {
    system: `${MENTOR_SYSTEM} Find meaningful connections between story elements. Identify thematic links, cause-and-effect chains, and world-building synergies. Reference the related ideas if provided.`,
    userPrompt: (cat, idea, ctx) => `Find narrative connections and thematic links for this ${cat} idea:\n\n"${idea}"${ctx}`,
  },
  Challenge: {
    system: `${MENTOR_SYSTEM} Be a thoughtful devil's advocate. Find logical gaps, internal contradictions, and story-breaking weaknesses. Be constructive and specific, not harsh.`,
    userPrompt: (cat, idea, ctx) => `Challenge this ${cat} idea — find weaknesses, plot holes, or inconsistencies to strengthen it:\n\n"${idea}"${ctx}`,
  },
  Boost: {
    system: `${MENTOR_SYSTEM} Make ideas more vivid, specific, and emotionally resonant. Replace generic details with concrete, memorable ones. Keep the core concept intact.`,
    userPrompt: (cat, idea, ctx) => `Make this ${cat} idea more vivid and emotionally resonant:\n\n"${idea}"${ctx}`,
  },
  Compress: {
    system: `${MENTOR_SYSTEM} Distill ideas to their sharpest, most essential form. Remove filler, keep the core insight. Deliver 1-3 crisp sentences maximum.`,
    userPrompt: (cat, idea, ctx) => `Compress this ${cat} idea to its essential core in 1-3 sentences:\n\n"${idea}"${ctx}`,
  },
  Generate: {
    system: `${MENTOR_SYSTEM} Write a short, vivid prose sketch (150-250 words) inspired by the idea. Show, don't tell. Use consistent tense. Make it feel alive.`,
    userPrompt: (cat, idea, ctx) => `Write a short scene or dialogue sketch inspired by this ${cat} idea:\n\n"${idea}"${ctx}`,
  },
};

export const SketchpadAIService = {
  buildMessages(
    mode: SketchpadAIMode,
    idea: string,
    category: string,
    relatedIdeas?: string[]
  ): Message[] {
    const contextBlock = relatedIdeas?.length
      ? `\n\nRelated ideas in this world:\n${relatedIdeas.map((r) => `- ${r}`).join('\n')}`
      : '';

    const { system, userPrompt } = MODE_CONFIGS[mode];
    return [
      { role: 'system', content: system },
      { role: 'user', content: userPrompt(category, idea, contextBlock) },
    ];
  },
};
