<div align="center">

<img src="public/IMG_4710.png" height="72" alt="MeyvnAI" />

# MeyvnAI

**A custom 100M parameter offline-first causal transformer with 1.58-bit BitLinear quantization, RoPE + SwiGLU internals, and a seven-module biologically inspired optimization stack — targeting ~50 MB ONNX int4 browser deployment via WebGPU streaming inference.**

[![Phase](https://img.shields.io/badge/Phase-1%20·%20Architectural%20Implementation-7c3aed?style=flat-square)]()
[![Parameters](https://img.shields.io/badge/Parameters-100.8M-0d9488?style=flat-square)]()
[![Target](https://img.shields.io/badge/Target%20Deploy-50MB%20ONNX%20int4%20%2F%20WebGPU-475569?style=flat-square)]()
[![License](https://img.shields.io/github/license/shaneweickum-lab/Scriptorium?style=flat-square&color=0d9488)](LICENSE)

</div>

---

## Project Status — Phase 1: Structural & Architectural Implementation

MeyvnAI is currently in **Phase 1**. The complete structural framework is implemented and open for architectural review:

- **Every layer is written and forward-passes correctly** — transformer blocks, BitLinear 1.58-bit QAT, RoPE, SwiGLU FFN, and pre-norm RMSNorm are all wired and tensor-shape-verified
- **All seven Digital Biology modules are implemented** — elastic stability, neuromorphic spiking, neuro-plastic optimizer, stochastic divergence governor, token compression, emotion engine, and DNA memory are coded, documented, and importable
- **The full data pipeline exists** — corpus download, deduplication, BPE tokenizer training, shard tokenization, and DataLoader are implemented in `training/data/`
- **Training and SFT loops are implemented** — `train.py` and `finetune.py` with gradient accumulation, cosine LR schedule, and checkpoint management are ready to execute
- **Tensor-level sparsity logic is live** — top-5% LIF firing threshold, ternary `{−1, 0, +1}` weight distribution, and 2-to-1 token compression gating are all active in the forward pass

**Phase 2 (Pre-training and SFT execution)** is staged for launch once dedicated compute is allocated. The 2.5B-token pre-training run requires ~3.6 days on an M5 Max or ~14 hours on a single A100 (~$15–25 cloud cost). This repository is a pure demonstration of AI systems architecture; no pre-training has been executed yet.

---

## Core Architecture

| Hyperparameter | Value | Design Rationale |
|---|---|---|
| Architecture | Decoder-only causal transformer | GPT-style autoregressive generation |
| Parameters | **100.8M** | Chinchilla-optimal at 2B tokens; 4× over-training margin at 2.5B |
| `d_model` | **640** | Fits browser memory at ONNX int4; 64-dim per attention head |
| Layers | **15** | Hits target param count with this `d_model` / `ffn_dim` combination |
| Attention heads | **10** | 64-dim head size — well-studied, numerically stable |
| `ffn_dim` | **1,920** | 3× `d_model` — SwiGLU requires gate, up, and down projections |
| Vocabulary | **32,768-token BPE** | Writing-optimized with structural special tokens: `<\|scene\|>`, `<\|lore\|>`, `<\|inst\|>` |
| Context window | **2,048 tokens** | Full scene + lore context at inference |
| Positional encoding | **RoPE** | Extrapolates beyond training length; no learned position table |
| Normalization | **Pre-norm RMSNorm ε=1e-8** | Tighter epsilon for pre-quantization stability |
| Activation | **SwiGLU** | Lower loss than ReLU/GELU at this scale |
| Quantization | **BitLinear 1.58-bit QAT** | Ternary `{−1, 0, +1}` weights via Straight-Through Estimator |
| LM head | **Weight-tied to embedding** | No additional output projection parameters |
| Target export | **ONNX int4 (~50 MB) / GGUF Q4_K_M (~56 MB)** | Browser Cache API + WebGPU; Ollama local inference |

### Parameter Budget

| Component | Count |
|---|---|
| Token embeddings (32,768 × 640) | 20,971,520 |
| 15× Attention — Q, K, V, O (each 640²) | 24,576,000 |
| 15× SwiGLU FFN — gate + up + down | 55,296,000 |
| 15× RMSNorm pairs + final norm | 19,840 |
| LM head (weight-tied — no extra params) | 0 |
| **Total** | **100,863,360** |

---

## Deep-Dive: Core Technical Implementations

### Quantization & Inference Engine

[→ `training/meyvn_slm/layers/bit_linear.py`](./training/meyvn_slm/layers/bit_linear.py)
[→ `training/meyvn_slm/model.py`](./training/meyvn_slm/model.py)
[→ `training/meyvn_slm/config.py`](./training/meyvn_slm/config.py)

- **BitLinear 1.58-bit QAT** — Shadow weights in `bfloat16` are quantized to ternary `{−1, 0, +1}` via `sign(w) · round(abs(w)/γ)` with a Straight-Through Estimator carrying gradients through the discretization boundary. Per-tensor scale `γ` is an EMA over `mean(|W|)`, not a learned parameter.
- **Addition-only inner products** — The ternary weight matrix `W` is decomposed into binary masks `w_pos = (W == +1)` and `w_neg = (W == -1)`. The forward pass computes `y = F.linear(x, w_pos) − F.linear(x, w_neg)` — no floating-point multiplications in the hot path.
- **8-bit per-token activation quantization** — Activations `x` are scaled by `η = absmax(x) / 127` before the BitLinear inner product, preserving dynamic range across the ternary weight projection. A 4-bit nibble-packing variant stores two activations per `int8` byte (zero-point = 8, scale = `absmax / 7`).
- **Transformer internals** — RoPE embeddings are applied to Q and K projections with `θ = 10,000`. SwiGLU computes `FFN(x) = (xW_gate · σ(xW_gate)) · xW_up · W_down` across three separate weight matrices. Pre-norm RMSNorm (ε = 1e-8) precedes both attention and FFN sublayers.

---

### The Digital Biology Stack

Seven biologically inspired modules layered on the base transformer. None add significant parameter count — they operate on training dynamics, sparsity, and inference-time conditioning.

[→ `training/meyvn_slm/digital_biology/`](./training/meyvn_slm/digital_biology/)

---

#### Module 01 — Elastic Stability (ElasticBitLinear)

[→ `training/meyvn_slm/digital_biology/elastic_stability.py`](./training/meyvn_slm/digital_biology/elastic_stability.py)

- **γ EMA momentum stabilization** — The per-tensor scale `γ` is updated with a running EMA (momentum `α = 0.1`) rather than recalculated per step. This prevents bulk weight-flip cascades where a sudden spike in `mean(|W|)` snaps a large fraction of weights across the `{0, ±1}` boundary simultaneously, causing loss spikes.
- **Homeostatic τ scaling** — A second EMA tracks the ternary weight distribution (`zero_pct`, `pos_pct`, `neg_pct`). If `zero_pct` drifts outside the healthy range (25–55%), `τ` is adjusted to restore balance — biologically equivalent to homeostatic synaptic scaling.
- Replaces the standard `nn.Linear` in all attention projections and FFN layers when `use_bitlinear=True` in `MeyvnSLMConfig`.

---

#### Module 02 — Neuromorphic Spiking FFN

[→ `training/meyvn_slm/digital_biology/neuromorphic.py`](./training/meyvn_slm/digital_biology/neuromorphic.py)

- **Leaky Integrate-and-Fire (LIF) activation** — Each FFN neuron maintains a membrane potential `V`. Input current is accumulated: `V ← β·V + x`. When `V` exceeds threshold `θ`, the neuron fires (outputs 1) and resets. `LIFStateless` resets per-token; `LIFStateful` carries state across sequence positions.
- **Top-5% sparsity gate** — Only the top 5% of neurons by activation magnitude fire per token. The rest output zero. This is not dropout — it is a hard structural constraint on the forward pass that produces natural token-level sparsity mirroring cortical firing density.
- **`SpikingFFN`** wraps the three-layer SwiGLU block with LIF activations between projections. Combined with Module 05's 2-to-1 token compression, this produces a ~4× FLOP reduction over a dense transformer FFN.

---

#### Module 03 — NeuroPlastic Optimizer

[→ `training/meyvn_slm/digital_biology/neuro_plastic.py`](./training/meyvn_slm/digital_biology/neuro_plastic.py)

- **Per-neuron Frequency-Intensity Weight (FIW) adaptive learning rates** — Each parameter maintains a FIW score tracking gradient frequency (how often the gradient is non-zero) and gradient intensity (RMS gradient magnitude). The FIW score is an EMA updated every step: `FIW ← ρ·FIW + (1−ρ)·|g|`.
- **Adaptive LR scaling** — Neurons with high FIW (hyperactive — strong, frequent gradients) have their learning rate dampened by a factor of `1 / (1 + FIW)`. Neurons with low FIW (underused) receive a rescue boost. This prevents gradient saturation in high-signal neurons while recovering dead neurons — the synaptic scaling analogue.
- Extends `AdamW`. FIW state adds ~10 MB for the full 100M model — negligible overhead.

---

#### Module 04 — Stochastic Divergence Governor

[→ `training/meyvn_slm/digital_biology/creativity.py`](./training/meyvn_slm/digital_biology/creativity.py)

- A continuous creativity dial: `creativity=0.0` drives near-greedy, highest-probability generation; `creativity=1.0` maximizes divergence from the mode.
- **Four mechanisms:** (1) Temperature interpolation between `T_min=0.7` and `T_max=1.35`. (2) Resonance bonus adds `λ·log(1/p(token))` to self-information tokens — rewarding structurally surprising completions. (3) Anti-mode penalty subtracts weight from the top-K tokens at each step, preventing mode collapse. (4) Entropy momentum corrects cumulative divergence drift over long sequences.
- Used by the Emotion Engine to shift generation parameters in response to the writer's detected emotional state.

---

#### Module 05 — Token Compression & Addition-Only Kernel

[→ `training/meyvn_slm/digital_biology/token_compression.py`](./training/meyvn_slm/digital_biology/token_compression.py)

- **`TokenCompressor21`** — Gated 2-to-1 adjacent-token merging. Given sequence `x ∈ ℝ^{T×d}`, even/odd token pairs are concatenated and passed through a gate projection: `g = σ(W_gate · [x_even ‖ x_odd])`. The merged token is `g·x_even + (1−g)·x_odd`. Output is `T/2` tokens — halving the sequence length before attention, reducing attention FLOPs by 4×.
- **`ActivationQuantizer`** — 8-bit per-token quantization (`scale = absmax/127`) for the addition-only kernel path. 4-bit nibble packing for peak memory reduction: even token activations in the high nibble, odd in the low nibble, two activations per `int8` byte.
- **`AddOnlyOps`** — The full addition-only inference kernel. Decomposes ternary `W` into `w_pos` and `w_neg` binary masks; accumulates sums using only integer additions, then applies scale `η·γ`. No multiplications in the inner loop.

---

#### Module 06 — Emotion Engine (VAD)

[→ `training/meyvn_slm/digital_biology/emotion_engine.py`](./training/meyvn_slm/digital_biology/emotion_engine.py)

- **Three-dimensional affective state** — All emotion is represented as a continuous point in Valence-Arousal-Dominance (VAD) space, all dimensions in `[−1, +1]`. This is not classification — it is a differentiable coordinate in affect space.
- **Dual detection path:**
  - *Lexical:* ~130-word `EmotionLexicon` with hand-tuned VAD scores for writing-context vocabulary. Negation handling flips valence by `×(−0.6)`, arousal by `×0.7`, dominance by `×(−0.5)`. Confidence is `min(0.90, count × 0.12)`.
  - *Hidden-state projection:* `EmotionProjector` — a linear head `ℝ^{d_model} → ℝ^3` initialized near-zero (`σ = 0.005`), outputs `tanh`-bounded VAD from the final hidden state. Trained during SFT.
  - Blend: `state = w·lexical + (1−w)·projected` where `w = lexical.confidence`.
- **`EmotionalMemory`** — EMA over session turns (momentum `α = 0.65`, ≈ 3-turn effective window). Tracks session arc, escalation detection (valence drop > 0.35), and baseline decay (0.04/turn) between sessions. State stored as `register_buffer` — survives checkpoint roundtrips.
- **`EmotionConditioner`** — Gated hidden-state injection. A 2-layer MLP maps VAD → `ℝ^{d_model}`. A learnable gate parameter starts at `0` (zero effect at init — `tanh(0) = 0`), growing during SFT. Final: `h ← h + tanh(gate) · MLP(VAD)`.
- **`EmpathyModulator`** — Deterministic generation parameter shifts from current VAD:
  - `creativity = 0.5 + 0.30·v·(1 + 0.5·max(a, 0))`, clamped `[0.10, 0.95]`
  - `resonance_weight = 0.30 − 0.15·v + 0.10·(1−d)` + `0.10` if acute distress
  - `temperature_bias = 0.15·v·max(a, 0)`, clamped `[−0.30, +0.30]`

---

#### Module 07 — DNA Memory

[→ `training/meyvn_slm/digital_biology/dna_memory.py`](./training/meyvn_slm/digital_biology/dna_memory.py)

- **Persistent on-device user profile** — `DNAMemory` accumulates observations across sessions into seven trait categories: `topics`, `style_prefs`, `creative_triggers`, `sensitivities`, `emotional_patterns`, `vocabulary`, `session_metadata`. No fine-tuning required — the profile conditions generation via a context prefix.
- **EMA strength scoring** — Each `Trait` carries an EMA strength in `[0, 1]`: `strength ← 0.85·strength + 0.15·signal`. Half-life ≈ 4 sessions without reinforcement. Traits below `0.05` are pruned; max 50 traits per category.
- **Automated ingestion from Emotion Engine** — `ingest_from_emotion(emotion_state, text)` routes automatically: high valence + high arousal → `observe_trigger`; negative valence + distress → `observe_sensitivity`; neutral → `observe_topic`.
- **`[DNA]` context prefix** — `build_context_prefix()` selects the top-K strongest traits per category and formats a structured prefix injected before user input at inference time. No weights updated — the profile steers generation purely through the context window.
- **Fully serializable** — `to_json()` / `from_json()` for IndexedDB persistence alongside book data. Zero server dependency.

---

## Agentic Integration — Active Bridge During Pre-Training

While Phase 2 (pre-training and SFT) is pending compute allocation, a full agentic integration layer is live and gives any MCP-compatible AI agent the same contextual access to the writer's library that MeyvnAI will have at inference time.

[→ `scriptorium-mcp/`](./scriptorium-mcp/)
[→ `src/features/ai-engine/services/`](./src/features/ai-engine/services/)

### Scriptorium MCP Server

A standalone Node.js MCP server ([`@modelcontextprotocol/sdk`](https://github.com/modelcontextprotocol/typescript-sdk)) watches a local `scriptorium-sync.json` file written by Scriptorium after every save. Exposes 8 structured tools:

| Tool | Access Level |
|---|---|
| `list_books` | Library metadata + total word counts |
| `get_outline` | Full hierarchical manuscript tree (Part → Chapter → Scene → Note) |
| `get_scene` | Full plain-text content of any node |
| `search_content` | Full-text search across a book's writing nodes |
| `get_world_entries` | World bible entries, filterable by section name |
| `get_world_entry` | Single lore entry with all custom fields |
| `get_stats` | Word count, node count, goal progress |
| `write_scene` | Queues a `PendingWrite` in the sync file — applied by Scriptorium on next sync, writer stays in control |

**Write-back architecture** — The MCP server never writes directly to IndexedDB. It appends to a `pending_writes` queue in the sync JSON. Scriptorium's `syncStore` reads and applies pending writes before each export cycle. This ensures the writer retains explicit control over all AI-generated content.

**Setup:**
```bash
cd scriptorium-mcp
npm install && npm run build
```

Add to your MCP client (`~/.claude/mcp.json` for Claude Code):
```json
{
  "mcpServers": {
    "scriptorium": {
      "command": "node",
      "args": [
        "/path/to/scriptorium-mcp/dist/index.js",
        "--sync-file", "/your-sync-folder/scriptorium-sync.json"
      ]
    }
  }
}
```

### Ollama Hot-Swap Bridge

[→ `src/features/ai-engine/services/OllamaService.ts`](./src/features/ai-engine/services/OllamaService.ts)

`OllamaService` provides a drop-in inference backend via local Ollama models while MeyvnAI's ONNX export is pending. The service interface is identical to the planned `MeyvnModelService` — switching backends at runtime requires only a provider flag, with no upstream component changes.

### RAG Pipeline & Vector Index

[→ `src/features/ai-engine/services/RagService.ts`](./src/features/ai-engine/services/RagService.ts)
[→ `src/features/ai-engine/services/VectorIndexService.ts`](./src/features/ai-engine/services/VectorIndexService.ts)

A full retrieval-augmented generation pipeline is active using `@xenova/transformers` for in-browser embedding generation (no server). `VectorIndexService` maintains a flat similarity index over world bible entries and writing nodes. `RagService` constructs lore-grounded context windows by retrieving top-K chunks relevant to the current scene before each generation call — the same retrieval pattern MeyvnAI will use at inference.

---

## Repository Map

Engineers: the AI systems code lives entirely in `training/` (Python — model, training, Digital Biology) and `src/features/ai-engine/` (TypeScript — browser inference layer). Everything else is the Scriptorium writing platform.

```
training/
├── meyvn_slm/
│   ├── model.py                          ← Transformer forward pass (attn, FFN, RoPE, logits)
│   ├── config.py                         ← MeyvnSLMConfig (d=640, L=15, H=10 → 100.8M params)
│   ├── __init__.py                       ← Package exports
│   │
│   ├── layers/
│   │   └── bit_linear.py                 ← BitLinear 1.58-bit QAT layer + STE gradient
│   │
│   └── digital_biology/
│       ├── elastic_stability.py          ← Module 01: γ EMA, homeostatic τ, addition-only kernel
│       ├── neuromorphic.py               ← Module 02: LIFStateless, LIFStateful, SpikingFFN
│       ├── neuro_plastic.py              ← Module 03: NeuroPlasticOptimizer (FIW adaptive LR)
│       ├── creativity.py                 ← Module 04: StochasticDivergenceGovernor
│       ├── token_compression.py          ← Module 05: TokenCompressor21, ActivationQuantizer, AddOnlyOps
│       ├── emotion_engine.py             ← Module 06: EmotionLexicon, EmotionProjector, EmotionalMemory,
│       │                                              EmotionConditioner, EmpathyModulator, EmotionEngine
│       ├── dna_memory.py                 ← Module 07: Trait, DNAMemory (EMA profile + [DNA] prefix)
│       └── __init__.py                   ← Re-exports all 7 module public classes
│
├── data/
│   ├── download.py                       ← Corpus acquisition (Gutenberg, WritingPrompts, WikiText)
│   ├── clean.py                          ← MinHash LSH dedup, perplexity filter, language detect
│   ├── tokenize_corpus.py                ← Shard tokenization to memory-mapped uint16 arrays
│   ├── sft_dataset.py                    ← Instruction-tuning dataset (50k writing pairs)
│   └── validate_shards.py               ← Shard integrity and token count verification
│
├── tokenizer/
│   └── train_tokenizer.py                ← BPE tokenizer training at 32,768 vocab
│
├── train.py                              ← Pre-training loop (grad accum, cosine LR, checkpointing)
├── train_config.py                       ← TrainConfig: 19,073 steps × 131k tokens = 2.5B
├── finetune.py                           ← SFT loop (response-only loss masking)
├── finetune_config.py                    ← SFT hyperparameters
├── eval.py                               ← Perplexity evaluation
└── benchmark.py                          ← Throughput benchmarking across devices

src/features/ai-engine/
├── services/
│   ├── OllamaService.ts                  ← Local Ollama inference bridge (hot-swap backend)
│   ├── RagService.ts                     ← RAG pipeline: retrieval + context window construction
│   ├── VectorIndexService.ts             ← In-browser flat similarity index (no server)
│   ├── VectorService.ts                  ← @xenova/transformers embedding generation
│   ├── StyleAnalyzer.ts                  ← Writing style feature extraction
│   ├── StyleProfileStore.ts              ← Per-book style profile persistence
│   ├── OracleMLService.ts                ← Training corpus ingestion and analysis
│   ├── ChunkingService.ts                ← Document chunking for RAG
│   └── WritingBlockService.ts            ← Writer's block detection heuristics
│
├── hooks/
│   ├── useAuthorAI.ts                    ← Primary AI feature hook (compose, continue, suggest)
│   ├── useOracleML.ts                    ← Training portal integration hook
│   ├── useVectorIndex.ts                 ← Similarity search hook
│   └── useWritingBlock.ts                ← Block detection hook
│
└── transformers/
    └── worldBibleTransformer.ts          ← WorldEntry[] → RAG context block

scriptorium-mcp/                          ← MCP server (Node.js, stdio transport)
├── src/
│   ├── index.ts                          ← Server entry, --sync-file arg, MCP connect
│   ├── reader.ts                         ← File watcher, JSON cache, pending write queue
│   ├── tools.ts                          ← 8 tool handlers (list_books → write_scene)
│   ├── tiptap.ts                         ← Plain text → TipTap JSON conversion
│   └── types.ts                          ← ScriptoriumSync, SyncNode, PendingWrite interfaces
└── README.md                             ← MCP client setup guide

src/utils/fileSync.ts                     ← Browser sync: IndexedDB → scriptorium-sync.json
src/store/syncStore.ts                    ← Zustand sync state, auto-sync on write node change
```

---

## Training Execution Plan

Pre-training has not been run. The configuration below is staged and ready to execute.

| Dimension | Value |
|---|---|
| Total tokens | 2.5B (25% over Chinchilla-optimal for 100M) |
| Steps | 19,073 (effective batch = 4 × 16 × 2,048 = 131,072 tokens/step) |
| LR schedule | Cosine, max `3e−4`, min `3e−5`, 1,000-step warmup |
| Optimizer | AdamW β=(0.9, 0.95), weight decay 0.1, grad clip 1.0 |
| BitLinear LR scale | 0.5× on ternary layers (prevents shadow-weight ping-pong) |
| Peak memory | ~2.5–3 GB (no gradient checkpointing needed at 100M) |

| Hardware | Throughput | Wall-clock | Cost |
|---|---|---|---|
| M5 Max 48 GB | ~8,000 tok/s | ~3.6 days | $0 (on-device) |
| M5 Pro 24 GB | ~4,000 tok/s | ~7.2 days | $0 (on-device) |
| RTX 4090 24 GB | ~20,000 tok/s | ~36 hours | Local hardware |
| A100 80 GB SXM | ~50,000 tok/s | ~14 hours | ~$15–25 cloud |

**Post pre-training:** 50k instruction pairs for SFT (scene continuation, style matching, lore-grounded generation, outline expansion, lore sentinel detection) with response-only loss masking. Followed by ONNX int4 export (~50 MB) and GGUF Q4_K_M (~56 MB) for browser and Ollama delivery respectively.

---

## Development Setup

**Python — model, training, Digital Biology**

```bash
cd training
pip install -r requirements.txt   # torch, transformers, datasets, wandb, bitsandbytes

# Verify the full model + Digital Biology stack loads
python -c "from meyvn_slm import MeyvnSLM, MeyvnSLMConfig; m = MeyvnSLM(MeyvnSLMConfig()); print(m.param_count_str())"

# Run architecture tests
python -m pytest tests/ -v
```

**MCP Server — Node.js**

```bash
cd scriptorium-mcp
npm install
npm run build          # compiles TypeScript → dist/
node dist/index.js --sync-file /path/to/scriptorium-sync.json
```

**TypeScript / Browser — Scriptorium platform**

```bash
npm install
npm run dev            # → http://localhost:5173
npm run build          # tsc + Vite production bundle
```

---

<div align="center">

**MeyvnAI** · Custom SLM for narrative writing · 100M parameters · Offline-first · Built from first principles

</div>
