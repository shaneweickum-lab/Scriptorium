# scriptorium-mcp

An MCP server that gives any MCP-compatible AI agent the same level of access to your Scriptorium library that MeyvnAI has at inference time — your full manuscript, world bible, and writing statistics, all read from a local JSON file.

## How it works

Scriptorium writes a `scriptorium-sync.json` file to a folder you choose. This MCP server watches that file and exposes it as structured tools. No cloud, no account — the file never leaves your machine.

## Setup

### 1. Connect a sync folder in Scriptorium

Open any book → **Book Settings** → **Sync** tab → **Connect Folder**.

Pick any local folder. Scriptorium will write `scriptorium-sync.json` there and keep it updated after every save.

### 2. Build the MCP server

```bash
cd scriptorium-mcp
npm install
npm run build
```

### 3. Add to your MCP client config

**Claude Code** (`~/.claude/mcp.json`):

```json
{
  "mcpServers": {
    "scriptorium": {
      "command": "node",
      "args": [
        "/absolute/path/to/scriptorium-mcp/dist/index.js",
        "--sync-file",
        "/path/to/your/sync-folder/scriptorium-sync.json"
      ]
    }
  }
}
```

Or use the env var `SCRIPTORIUM_SYNC_FILE` instead of the `--sync-file` flag.

## Available tools

| Tool | Description |
|------|-------------|
| `list_books` | All books with metadata and total word counts |
| `get_outline` | Full hierarchical outline for a book (parts → chapters → scenes) |
| `get_scene` | Full text content of a specific node |
| `search_content` | Full-text search across a book's writing nodes |
| `get_world_entries` | World bible entries, optionally filtered by section |
| `get_world_entry` | Single entry with all custom fields |
| `get_stats` | Word counts, node counts, goal progress |
| `write_scene` | Queue new content for a node (applied when Scriptorium syncs) |

## Write-back

When you call `write_scene`, the server adds the change to a `pending_writes` queue in the sync file. The next time Scriptorium syncs (automatically after saves, or via **Sync Now**), it reads the queue, applies the changes to the database, and clears the queue.

The writer always stays in control — nothing is applied silently.
