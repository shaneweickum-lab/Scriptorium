/**
 * StructureAnalysisService — builds prompts for the Structure Assistant.
 *
 * Produces encouraging, mentor-voiced analysis prompts for scene-level
 * and chapter-level structure review. Covers: opening hook, pacing,
 * transitions, coherence, and dialogue/action balance.
 */

import type { OllamaMessage } from './OllamaService';

const SYSTEM_PROMPT =
  'You are Meyvn, a warm and encouraging writing mentor inside Scriptorium. ' +
  'Your goal is to help authors — especially new writers — improve their story structure. ' +
  'Be specific, supportive, and actionable. Celebrate what works before suggesting improvements. ' +
  'Never be discouraging. Use plain language, not literary jargon. ' +
  'Format your response with bold section headers using **Header** markdown syntax. ' +
  'Keep each section to 2–4 sentences. End with a short motivating closing line.';

export const StructureAnalysisService = {
  buildSceneMessages(opts: { title: string; content: string }): OllamaMessage[] {
    const { title, content } = opts;
    const trimmed = content.length > 5000
      ? content.slice(0, 5000) + '\n\n[…trimmed for analysis…]'
      : content;

    const user =
      `Please analyze the structure of my scene titled "${title}".\n\n` +
      `${trimmed}\n\n` +
      `Cover these areas:\n` +
      `**Opening Hook** — Does the scene open in a way that immediately draws the reader in?\n` +
      `**Pacing & Flow** — Is the scene's rhythm varied and engaging, or does it drag or rush?\n` +
      `**Paragraph Transitions** — Do paragraphs and beats connect naturally to each other?\n` +
      `**Dialogue & Action Balance** — Is there a good mix of conversation, action, and thought?\n` +
      `**What You Did Well** — One specific strength worth celebrating in this scene.`;

    return [
      { role: 'system', content: SYSTEM_PROMPT },
      { role: 'user', content: user },
    ];
  },

  buildChapterMessages(opts: {
    title: string;
    sceneTexts: Array<{ title: string; content: string }>;
  }): OllamaMessage[] {
    const { title, sceneTexts } = opts;

    const body = sceneTexts
      .map((s, i) => `--- Scene ${i + 1}: ${s.title || 'Untitled'} ---\n${s.content}`)
      .join('\n\n');

    const trimmed = body.length > 6000
      ? body.slice(0, 6000) + '\n\n[…trimmed for analysis…]'
      : body;

    const user =
      `Please analyze the structure of my chapter titled "${title}" ` +
      `which contains ${sceneTexts.length} scene${sceneTexts.length !== 1 ? 's' : ''}.\n\n` +
      `${trimmed}\n\n` +
      `Cover these areas:\n` +
      `**Opening Hook** — Does the chapter open in a way that pulls the reader in immediately?\n` +
      `**Scene Transitions** — Do scenes flow naturally into each other, or are there jarring jumps?\n` +
      `**Overall Pacing** — Is the chapter's rhythm varied — does it breathe and build tension effectively?\n` +
      `**Narrative Coherence** — Is the story thread clear and consistent throughout the chapter?\n` +
      `**What You Did Well** — One specific strength worth celebrating across these scenes.`;

    return [
      { role: 'system', content: SYSTEM_PROMPT },
      { role: 'user', content: user },
    ];
  },
};
