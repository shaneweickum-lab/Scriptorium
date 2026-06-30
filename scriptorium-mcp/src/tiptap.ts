// Converts plain text (with newlines) to a minimal TipTap JSON document.
// Used when the MCP server queues a write_scene call.
export function textToTiptap(text: string): string {
  const paragraphs = text.split(/\n+/).filter((p) => p.trim().length > 0);
  const doc = {
    type: 'doc',
    content: paragraphs.map((p) => ({
      type: 'paragraph',
      content: [{ type: 'text', text: p.trim() }],
    })),
  };
  return JSON.stringify(doc);
}
