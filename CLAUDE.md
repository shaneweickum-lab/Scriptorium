# Scriptorium — Claude Code Guide

## Project Overview

**Scriptorium** (branded as *Wizards Playground*) is a local-first, offline-only PWA writing studio for authors. All data lives on the user's device — there is no backend, no account system, and no network calls for core functionality.

---

## Tech Stack

| Layer | Technology |
|---|---|
| UI | React 19 + TypeScript 5.9 |
| Styling | Tailwind CSS 3 + `@tailwindcss/typography` |
| State | Zustand 5 |
| Rich text | TipTap 3 (ProseMirror) |
| Local storage | **Dexie 4** (IndexedDB ORM) |
| Drag & drop | dnd-kit |
| Export | `docx` (Word), `jszip` (EPUB) |
| Build | Vite 8 + `vite-plugin-pwa` (Workbox) |
| Lint | ESLint 9 |

> **Storage note:** Data is stored in the browser's **IndexedDB** via Dexie.js — not SQLite. There is no server-side database. The Dexie database class is `ScriptoriumDB` defined in `src/db/database.ts`. All content persists across sessions within the same browser profile.

---

## Repository Layout

```
src/
├── App.tsx                    # Bootstrap: loads stores, routes between views
├── main.tsx                   # React root + PWA service worker registration
├── index.css                  # Global styles, ProseMirror overrides
│
├── components/
│   ├── achievements/          # Achievement modals and toast notifications
│   ├── assembly/              # Manuscript builder + print preview
│   ├── common/                # Modal, Button, Input, ConfirmDialog, EmptyState, Toast
│   ├── editor/                # RichTextEditor (TipTap), toolbar, find/replace, comments
│   ├── export/                # ExportModal — HTML, EPUB, DOCX, KDP DOCX
│   ├── landing/               # First-visit landing/onboarding page
│   ├── layout/                # AppShell, Sidebar, TopBar, ProjectSettings
│   ├── library/               # Library grid, book/world cards, new/edit modals
│   ├── timer/                 # Pomodoro timer + break overlay
│   ├── world/                 # World Bible section list + entry editor
│   └── writing/               # Outline tree, node editor, global search, world ref
│
├── db/
│   ├── database.ts            # ScriptoriumDB class — Dexie schema (v4)
│   ├── libraryRepository.ts   # Book CRUD helpers
│   └── worldBibleRepository.ts# WorldBible CRUD helpers
│
├── extensions/                # Custom TipTap extensions (comment marks, search)
├── features/
│   └── ai-engine/             # AI writing assistant (in development)
│       ├── hooks/             # React hooks for AI feature integration
│       ├── services/          # Core AI logic and provider communication
│       └── transformers/      # Data shape converters (DB ↔ AI prompt formats)
│
├── hooks/                     # Shared React hooks (useAutoSave, useProject, usePWAInstall)
├── store/                     # Zustand stores (see below)
├── types/                     # Shared TypeScript interfaces and constants
└── utils/                     # tiptapToHtml, sortableTree, etc.
```

---

## Local Database — IndexedDB via Dexie

**Class:** `ScriptoriumDB extends Dexie` — `src/db/database.ts`  
**Schema version:** 4

### Tables

| Table | Key | Indexes | Purpose |
|---|---|---|---|
| `books` | `id` | — | Book metadata (title, author, settings, word goal) |
| `worldSections` | `id` | `bookId`, `order` | Named categories inside a World Bible |
| `worldEntries` | `id` | `bookId`, `sectionId`, `updatedAt` | Individual lore entries (characters, places, etc.) |
| `writingNodes` | `id` | `bookId`, `parentId`, `order`, `type` | Hierarchical manuscript tree (Part → Chapter → Scene → Note) |
| `assemblies` | `id` | `bookId` | Ordered node list for final manuscript export |
| `worldBibles` | `id` | — | Standalone World Bible (linkable to multiple books) |
| `achievementUnlocks` | `id` | `achievementId`, `scopeId` | XP and badge unlock records |

### Content Format

All `.content` fields on `WorldEntry` and `WritingNode` store **TipTap JSON serialised as a string**. Use `tiptapJsonToText()` or `tiptapJsonToHtml()` from `src/utils/tiptapToHtml.ts` to read them.

### Migration History

- **v1** — Single-book schema (legacy)
- **v2** — Multi-book support; migrates v1 data into a default book
- **v3** — Adds `worldBibles` table
- **v4** — Adds `achievementUnlocks` table

---

## Manuscript Data Model

```
Book (books)
 └── WritingNode[] (writingNodes)   ← Part / Chapter / Scene / Note
      └── content: string           ← TipTap JSON
 └── Assembly (assemblies)          ← ordered export list
      └── AssemblyItem[]            ← node refs + section breaks + front matter
```

## World Bible Data Model

```
WorldBible (worldBibles)            ← standalone, can be linked to many books
 └── WorldSection[] (worldSections) ← e.g. Characters, Geography, Magic System
      └── WorldEntry[] (worldEntries)
           ├── content: string      ← TipTap JSON
           ├── tags: string[]
           └── customFields: CustomField[]
```

A book can link to a `WorldBible` via `Book.worldBibleId`. When linked, the world's sections and entries appear in the `@mention` autocomplete and the World Reference panel inside the editor.

---

## Zustand Stores

| File | Manages |
|---|---|
| `libraryStore` | Books list, active book, open/close |
| `writingStore` | Writing nodes tree, active node |
| `worldStore` | Sections, entries, linked world data |
| `assemblyStore` | Assembly items for manuscript |
| `worldBibleStore` | World bibles list, active world bible |
| `achievementStore` | Unlock set, XP total, achievement checks |
| `uiStore` | Modal visibility, view state, toasts |
| `timerStore` | Pomodoro timer state |
| `streakStore` | Writing streak dates (localStorage, external store) |
| `editorSettingsStore` | Font, size, line height, max width (localStorage) |
| `commentStore` | Inline comments (Zustand persist → localStorage) |

---

## AI Engine — `src/features/ai-engine/`

> **Status: Architecture scaffolded. No feature code written yet.**

The AI engine is designed around three layers:

### `hooks/`
React hooks that connect AI features to component state. These will consume services and expose loading/error/result state to the UI without coupling components to provider details.

### `services/`
Core AI logic: model selection, prompt construction, streaming response handling, local model communication (e.g. WebLLM / Ollama bridge). All services must operate **offline-first** — no cloud API calls should be required for core functionality.

### `transformers/`
Pure functions that convert between the app's internal data shapes and the formats needed for AI prompts. Examples:
- `WritingNode[]` → structured outline text
- `WorldEntry[]` → character/lore context block
- `Assembly` → flat manuscript string
- AI response → TipTap JSON delta

---

## Common Conventions

- **Colours:** Violet `#7c3aed`, Teal `#0d9488`, white backgrounds, slate borders. Primary gradient: `linear-gradient(135deg, #7c3aed, #0d9488)`.
- **Active states:** `bg-violet-50 text-violet-700 border-l-2 border-violet-500`.
- **Primary buttons:** white text + gradient via `style` prop (Tailwind cannot generate arbitrary gradient values dynamically).
- **IDs:** `crypto.randomUUID()` everywhere.
- **No backend:** Never add server-side calls for core features. AI inference must run locally.
- **No tests yet:** No Vitest/Jest configured. Use `npm run build` (TypeScript) and `npm run lint` to validate.

---

## Dev Commands

```bash
npm run dev      # Vite dev server (http://localhost:5173)
npm run build    # tsc -b && vite build
npm run lint     # ESLint
npm run preview  # Preview production build
```
