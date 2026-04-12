/**
 * test-vector-search.ts
 * ─────────────────────
 * Standalone integration test for the Local Vector Search module.
 * Runs entirely in Node.js — no browser, no Dexie, no React.
 *
 * Run with:
 *   npx tsx src/features/ai-engine/test-vector-search.ts
 *
 * What it verifies:
 *   1. ChunkingService splits text correctly at word boundaries.
 *   2. VectorService downloads the model and returns 384-dim embeddings.
 *   3. VectorStore indexes documents and returns them ranked by similarity.
 *   4. Semantically related queries retrieve the correct lore entry.
 *   5. Unrelated queries score below unrelated entries.
 */

import { chunkText, estimateTokenCount } from './services/ChunkingService.js';
import {
  worldEntryToText,
  extractText,
} from './transformers/worldBibleTransformer.js';
import { VectorService } from './services/VectorService.js';
import { VectorStore } from './services/VectorStore.js';
import type { WorldEntry, WorldSection } from '../../types/index.js';

// ---------------------------------------------------------------------------
// ANSI helpers for readable console output
// ---------------------------------------------------------------------------

const c = {
  reset: '\x1b[0m',
  bold: '\x1b[1m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  cyan: '\x1b[36m',
  yellow: '\x1b[33m',
  dim: '\x1b[2m',
};

let passed = 0;
let failed = 0;

function ok(label: string) {
  console.log(`  ${c.green}✓${c.reset} ${label}`);
  passed++;
}

function fail(label: string, detail?: string) {
  console.log(`  ${c.red}✗${c.reset} ${label}`);
  if (detail) console.log(`    ${c.dim}${detail}${c.reset}`);
  failed++;
}

function section(title: string) {
  console.log(`\n${c.bold}${c.cyan}▶ ${title}${c.reset}`);
}

// ---------------------------------------------------------------------------
// Fixture data — representative World Bible entries for a fantasy novel
// ---------------------------------------------------------------------------

type MockEntry = {
  id: string;
  sectionId: string;
  title: string;
  content: string; // TipTap JSON string
  tags: string[];
  customFields: { id: string; label: string; value: string; fieldType: 'text' }[];
};

const SECTION_CHARACTERS = { id: 's1', name: 'Characters', bookId: 'b1', icon: 'User', order: 0, createdAt: 0 };
const SECTION_MAGIC      = { id: 's2', name: 'Magic System', bookId: 'b1', icon: 'Zap', order: 1, createdAt: 0 };
const SECTION_GEOGRAPHY  = { id: 's3', name: 'Geography', bookId: 'b1', icon: 'Map', order: 2, createdAt: 0 };

// Helper: wrap plain text in minimal TipTap JSON
function makeTipTap(text: string): string {
  return JSON.stringify({
    type: 'doc',
    content: [{ type: 'paragraph', content: [{ type: 'text', text }] }],
  });
}

const ENTRIES: MockEntry[] = [
  {
    id: 'e1',
    sectionId: 's1',
    title: 'Aelindra the Stormweaver',
    content: makeTipTap(
      'Aelindra is an elven mage who can summon lightning and call down thunderstorms at will. ' +
      'She trained for three centuries at the Storm Spire and carries a staff of crystallised lightning. ' +
      'Her silver hair crackles with static electricity, and her eyes glow violet when she channels power.',
    ),
    tags: ['elf', 'mage', 'lightning', 'protagonist'],
    customFields: [
      { id: 'f1', label: 'Age', value: '312', fieldType: 'text' },
      { id: 'f2', label: 'Affiliation', value: 'Storm Spire Academy', fieldType: 'text' },
    ],
  },
  {
    id: 'e2',
    sectionId: 's2',
    title: 'Runebinding — Magical Inscription System',
    content: makeTipTap(
      'Runebinding allows practitioners to inscribe magical glyphs onto stone, metal, or skin. ' +
      'Each rune draws from a ley-line network beneath the earth. ' +
      'The Binding Rune of Sealing is most prized — it can lock any door, vault, or portal permanently. ' +
      'Overuse causes "rune fever", a progressive blindness that starts at the fingertips.',
    ),
    tags: ['magic', 'runes', 'inscription', 'ley-lines'],
    customFields: [],
  },
  {
    id: 'e3',
    sectionId: 's3',
    title: 'The Ashfen Marshes',
    content: makeTipTap(
      'A vast wetland in the southern reaches of the realm, perpetually shrouded in grey mist. ' +
      'The marshes are home to will-o-wisps that lure travellers off the safe causeways. ' +
      'Ancient ruins of the Sunken Kingdom lie beneath the brackish water, inaccessible except during the Drought Moon.',
    ),
    tags: ['location', 'swamp', 'ruins', 'danger'],
    customFields: [
      { id: 'f3', label: 'Climate', value: 'Temperate, perpetually foggy', fieldType: 'text' },
    ],
  },
  {
    id: 'e4',
    sectionId: 's1',
    title: 'Dorin Ashclad — the Fence',
    content: makeTipTap(
      'Dorin runs an underground trading post in the city of Veth. ' +
      'He deals in stolen magical artefacts and forged guild papers. ' +
      'Despite his criminal connections he has a strict code: he never sells weapons to slavers. ' +
      'He is bald, stout, and always chews dried sageroot to mask the smell of spirits.',
    ),
    tags: ['human', 'criminal', 'trader', 'npc'],
    customFields: [
      { id: 'f4', label: 'Location', value: 'City of Veth, Lower Market', fieldType: 'text' },
    ],
  },
  {
    id: 'e5',
    sectionId: 's2',
    title: 'Hearthfire Crystals',
    content: makeTipTap(
      'Hearthfire crystals are naturally occurring gemstones that store thermal energy. ' +
      'When crushed, they release intense heat capable of melting iron. ' +
      'Healers use powdered hearthfire crystal to cauterise wounds in the field. ' +
      'The crystals are mined exclusively from the volcanic vents of Mount Cindros.',
    ),
    tags: ['crystal', 'magic item', 'healing', 'fire', 'mining'],
    customFields: [
      { id: 'f5', label: 'Source', value: 'Mount Cindros volcanic vents', fieldType: 'text' },
    ],
  },
];

// ---------------------------------------------------------------------------
// Suite 1: ChunkingService
// ---------------------------------------------------------------------------

function testChunking() {
  section('ChunkingService');

  // Short text → single chunk, no splitting
  const short = 'The quick brown fox jumped over the lazy dog.';
  const shortChunks = chunkText(short, 512, 50);
  shortChunks.length === 1
    ? ok('Short text produces exactly 1 chunk')
    : fail('Short text produced multiple chunks', `got ${shortChunks.length}`);

  shortChunks[0].text === short
    ? ok('Chunk text matches input exactly')
    : fail('Chunk text mismatch');

  // Long text → multiple chunks with overlap
  const word = 'lorem ';
  const longText = word.repeat(500).trim(); // ~500 words ≈ 665 tokens
  const longChunks = chunkText(longText, 512, 50);
  longChunks.length > 1
    ? ok(`Long text (~665 tokens) split into ${longChunks.length} chunks`)
    : fail('Long text was not split into multiple chunks');

  // Verify overlap: last words of chunk N appear at the start of chunk N+1
  if (longChunks.length >= 2) {
    const words0 = longChunks[0].text.split(' ');
    const words1 = longChunks[1].text.split(' ');
    const overlapWords = words0.slice(-38); // ~50 tokens
    const startsWithOverlap = overlapWords.every((w, i) => words1[i] === w);
    startsWithOverlap
      ? ok('Adjacent chunks share expected word overlap')
      : fail('Adjacent chunks do not share expected overlap');
  }

  // estimateTokenCount
  const tokens = estimateTokenCount('hello world'); // 2 words ≈ 3 tokens
  tokens > 0
    ? ok(`estimateTokenCount("hello world") → ${tokens} tokens`)
    : fail('estimateTokenCount returned 0');

  // Empty string → no chunks
  chunkText('').length === 0
    ? ok('Empty input produces 0 chunks')
    : fail('Empty input produced chunks');
}

// ---------------------------------------------------------------------------
// Suite 2: worldBibleTransformer
// ---------------------------------------------------------------------------

function testTransformer() {
  section('worldBibleTransformer');

  // extractText from TipTap JSON
  const json = makeTipTap('Hello, world!');
  const extracted = extractText(json);
  extracted.includes('Hello, world!')
    ? ok(`extractText round-trips TipTap JSON → "${extracted}"`)
    : fail('extractText failed', extracted);

  // extractText handles invalid JSON gracefully
  const bad = extractText('NOT_JSON');
  bad === ''
    ? ok('extractText returns empty string for invalid JSON')
    : fail('extractText did not return empty for invalid JSON', bad);

  // worldEntryToText includes title, body, tags, and custom fields
  const e = ENTRIES[0];
  const text = worldEntryToText(e as unknown as WorldEntry, SECTION_CHARACTERS as WorldSection);
  const includes = (s: string) => text.includes(s);
  includes('Aelindra')    ? ok('Text includes entry title')     : fail('Text missing entry title');
  includes('lightning')   ? ok('Text includes body prose')      : fail('Text missing body prose');
  includes('elf')         ? ok('Text includes tags')            : fail('Text missing tags');
  includes('Storm Spire') ? ok('Text includes custom field')    : fail('Text missing custom field');
  includes('Characters')  ? ok('Text includes section name')    : fail('Text missing section name');
}

// ---------------------------------------------------------------------------
// Suite 3: VectorService + VectorStore (requires model download ~22 MB)
// ---------------------------------------------------------------------------

let skippedEmbedding = false;

async function testEmbeddingAndSearch() {
  section('VectorService — model load');

  const vs = VectorService.getInstance();

  process.stdout.write(`  ${c.yellow}⏳ Downloading all-MiniLM-L6-v2 (first run only, ~22 MB)…${c.reset}\r`);
  const t0 = Date.now();
  try {
    await vs.load();
  } catch (err: unknown) {
    process.stdout.write(' '.repeat(70) + '\r');
    const msg = err instanceof Error ? err.message : String(err);
    const isNetworkErr = msg.includes('fetch failed') || msg.includes('Connect Timeout') || msg.includes('ENOTFOUND') || msg.includes('ECONNREFUSED');
    if (isNetworkErr) {
      console.log(`  ${c.yellow}⚠ SKIPPED${c.reset}  Model download requires network access (offline environment).`);
      console.log(`  ${c.dim}Run this test with internet access to validate embedding + search.${c.reset}`);
      skippedEmbedding = true;
      return;
    }
    throw err; // Unexpected error — propagate
  }
  const elapsed = ((Date.now() - t0) / 1000).toFixed(1);
  process.stdout.write(' '.repeat(70) + '\r');

  vs.isReady
    ? ok(`Model ready in ${elapsed}s`)
    : fail('Model not ready after load()');

  // Single embed returns correct dimension
  const vec = await vs.embed('The wizard cast a fireball spell.');
  vec.length === 384
    ? ok(`embed() returns 384-dimensional vector`)
    : fail(`embed() returned ${vec.length} dimensions`);

  // Normalised: magnitude ≈ 1.0
  const mag = Math.sqrt(vec.reduce((s, v) => s + v * v, 0));
  Math.abs(mag - 1.0) < 0.01
    ? ok(`Vector is normalised (magnitude = ${mag.toFixed(4)})`)
    : fail(`Vector not normalised (magnitude = ${mag.toFixed(4)})`);

  // ---------------------------------------------------------------------------
  section('VectorStore — indexing & semantic retrieval');

  const store = new VectorStore();
  await store.initialize();

  // Embed and insert all fixture entries
  process.stdout.write(`  ${c.yellow}⏳ Embedding ${ENTRIES.length} lore entries…${c.reset}\r`);
  const sections = [SECTION_CHARACTERS, SECTION_MAGIC, SECTION_GEOGRAPHY] as WorldSection[];
  for (const entry of ENTRIES) {
    const text = worldEntryToText(
      entry as unknown as WorldEntry,
      sections.find((s) => s.id === entry.sectionId),
    );
    const embedding = await vs.embed(text);
    await store.add({
      id: `${entry.id}:0`,
      text,
      embedding,
      sourceId: entry.id,
      sourceType: 'worldEntry',
      title: entry.title,
      sectionName: sections.find((s) => s.id === entry.sectionId)?.name ?? '',
      chunkIndex: 0,
      tags: entry.tags.join(' '),
    });
  }
  process.stdout.write(' '.repeat(60) + '\r');

  const total = await store.size();
  total === ENTRIES.length
    ? ok(`Indexed ${total} entries`)
    : fail(`Expected ${ENTRIES.length} entries, got ${total}`);

  // ---------------------------------------------------------------------------
  section('Semantic similarity — query battery');

  async function runQuery(
    query: string,
    expectedTitle: string,
    description: string,
  ) {
    const qVec = await vs.embed(query);
    const results = await store.search(qVec, 3);

    if (results.length === 0) {
      fail(`"${description}": no results returned`);
      return;
    }

    const topTitle = results[0].title;
    const topScore = results[0].score.toFixed(4);

    topTitle === expectedTitle
      ? ok(
          `"${description}"\n    → "${topTitle}" (score ${topScore}) ✓`,
        )
      : fail(
          `"${description}": expected "${expectedTitle}", got "${topTitle}" (${topScore})`,
          results.map((r) => `${r.title} [${r.score.toFixed(4)}]`).join(', '),
        );
  }

  // These queries should retrieve the named entry as the top result.
  await runQuery(
    'elven mage who controls storms and electricity',
    'Aelindra the Stormweaver',
    'Elven storm mage query',
  );

  await runQuery(
    'magical glyphs inscribed to seal doors and vaults',
    'Runebinding — Magical Inscription System',
    'Rune inscription / sealing query',
  );

  await runQuery(
    'swampy wetland with ruins beneath the water',
    'The Ashfen Marshes',
    'Wetland ruins geography query',
  );

  await runQuery(
    'underground black market dealer who sells stolen artefacts',
    'Dorin Ashclad — the Fence',
    'Black-market trader query',
  );

  await runQuery(
    'fire gem used for healing wounds and cauterising injuries',
    'Hearthfire Crystals',
    'Healing crystal / fire stone query',
  );

  // Score ordering: semantically unrelated query should rank lower
  const qVec = await vs.embed('naval ship battle on the open ocean');
  const results = await store.search(qVec, 5);
  const maxScore = results[0]?.score ?? 0;
  maxScore < 0.6
    ? ok(`Unrelated query scores low (top score ${maxScore.toFixed(4)} < 0.6)`)
    : fail(`Unrelated query scored too high: ${maxScore.toFixed(4)}`);

  // ---------------------------------------------------------------------------
  section('VectorStore utilities');

  await store.deleteBySourceId('e1');
  const afterDelete = await store.size();
  afterDelete === ENTRIES.length - 1
    ? ok('deleteBySourceId removes correct entry')
    : fail(`Expected ${ENTRIES.length - 1} after delete, got ${afterDelete}`);

  const blob = await store.serialize();
  typeof blob === 'string' && blob.length > 0
    ? ok('serialize() returns a non-empty JSON string')
    : fail('serialize() returned empty blob');

  await store.clear();
  const afterClear = await store.size();
  afterClear === 0
    ? ok('clear() empties the index')
    : fail(`Expected 0 after clear(), got ${afterClear}`);
}

// ---------------------------------------------------------------------------
// Entry point
// ---------------------------------------------------------------------------

async function main() {
  console.log(`\n${c.bold}Scriptorium — Local Vector Search Test Suite${c.reset}`);
  console.log('─'.repeat(48));

  testChunking();
  testTransformer();
  await testEmbeddingAndSearch();

  // Summary
  const total = passed + failed;
  console.log('\n' + '─'.repeat(48));
  if (failed === 0) {
    if (skippedEmbedding) {
      console.log(`${c.bold}${c.green}${total} tests passed.${c.reset} ${c.yellow}Embedding suite skipped (no network).${c.reset}\n`);
    } else {
      console.log(`${c.bold}${c.green}All ${total} tests passed.${c.reset}\n`);
    }
  } else {
    console.log(
      `${c.bold}${failed} of ${total} tests failed.${c.reset} (${passed} passed)\n`,
    );
    process.exit(1);
  }
}

main().catch((err) => {
  console.error(`\n${c.red}Fatal:${c.reset}`, err);
  process.exit(1);
});
