#!/usr/bin/env node
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { CallToolRequestSchema, ListToolsRequestSchema } from '@modelcontextprotocol/sdk/types.js';
import { initReader } from './reader.js';
import { TOOLS, handleTool } from './tools.js';

// ── Parse --sync-file arg ──────────────────────────────────────────────────
function getSyncFilePath(): string {
  const idx = process.argv.indexOf('--sync-file');
  if (idx !== -1 && process.argv[idx + 1]) return process.argv[idx + 1];
  const env = process.env['SCRIPTORIUM_SYNC_FILE'];
  if (env) return env;
  console.error('Error: pass --sync-file <path> or set SCRIPTORIUM_SYNC_FILE');
  process.exit(1);
}

// ── Server setup ───────────────────────────────────────────────────────────
const server = new Server(
  { name: 'scriptorium-mcp', version: '0.1.0' },
  { capabilities: { tools: {} } }
);

server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools: TOOLS }));

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args = {} } = request.params;
  try {
    return await handleTool(name, args as Record<string, unknown>);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return { content: [{ type: 'text', text: `Error: ${msg}` }], isError: true };
  }
});

// ── Start ──────────────────────────────────────────────────────────────────
const syncFile = getSyncFilePath();
initReader(syncFile);

const transport = new StdioServerTransport();
await server.connect(transport);

process.stderr.write(`scriptorium-mcp ready — watching ${syncFile}\n`);
