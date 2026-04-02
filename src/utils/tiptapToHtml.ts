import { generateHTML } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Underline from '@tiptap/extension-underline';
import TextAlign from '@tiptap/extension-text-align';
import Highlight from '@tiptap/extension-highlight';

const extensions = [
  StarterKit,
  Underline,
  TextAlign.configure({ types: ['heading', 'paragraph'] }),
  Highlight,
];

export function tiptapJsonToHtml(json: string): string {
  if (!json) return '';
  try {
    const parsed = JSON.parse(json);
    return generateHTML(parsed, extensions);
  } catch {
    return '';
  }
}

export function tiptapJsonToText(json: string): string {
  const html = tiptapJsonToHtml(json);
  return html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
}

export function countWords(text: string): number {
  if (!text.trim()) return 0;
  return text.trim().split(/\s+/).length;
}
