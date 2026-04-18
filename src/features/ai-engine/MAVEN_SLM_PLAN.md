# MavenSLM — Custom 50M Parameter Writing Assistant Model

**Goal:** Build, train, and ship a custom small language model (SLM) purpose-built
for MavenAI's writing-assistant tasks — story continuation, style matching, lore
integration, and outline expansion — running fully offline inside Scriptorium.

---

## Architecture Specification

**Name:** MavenSLM-50M  
**Type:** Decoder-only causal transformer (GPT-style)  
**Parameter target:** ~49–52 M  

| Hyperparameter | Value | Rationale |
|---|---|---|
| `d_model` | 512 | Balanced capacity vs. memory |
| `n_heads` | 8 | 64-dim per head, standard for d_model=512 |
| `n_layers` | 10 | Hits ~49M with the other dims |
| `ffn_dim` | 2048 | 4× d_model (standard multiplier) |
| `vocab_size` | 32,768 | BPE, writing-optimised |
| `max_seq_len` | 2,048 | Full scene + lore context window |
| `dropout` | 0.1 | Regularisation during pre-train |
| `activation` | SwiGLU | Better loss vs. ReLU at small scale |
| `norm` | RMSNorm | Faster, numerically stable |
| `pos_encoding` | RoPE | Length generalisation beyond training |

**Exact parameter budget:**

| Component | Params |
|---|---|
| Token embeddings (32768 × 512) | 16,777,216 |
| Rotary position (no learned params) | 0 |
| 10× attention (Q,K,V,O each 512²) | 10,485,760 |
| 10× FFN SwiGLU (gate + up + down) | 20,971,520 |
| 10× RMSNorm pairs (pre-attn + pre-ffn) | 10,240 |
| Final RMSNorm | 512 |
| LM head (weight-tied to embedding) | 0 |
| **Total** | **~48,245,248 ≈ 48.2 M** |

Adjust `n_layers` to 11 (+3M) or bump `ffn_dim` to 2176 (+600k/layer) to hit
exactly 50M if needed during arch finalization.

---

## Phase 1 — Architecture & Tokenizer  
*Estimated effort: 1–2 weeks*

### 1.1 Python Model Implementation
- [ ] Create `maven_slm/` Python package (separate from Scriptorium frontend)
- [ ] Implement `MavenSLMConfig` dataclass (all hyperparams above)
- [ ] Implement `MavenSLM` in PyTorch:
  - `RMSNorm` layer
  - `RotaryEmbedding` (RoPE, precomputed freqs)
  - `SwiGLU` FFN block
  - `CausalSelfAttention` (grouped-query optional for v2)
  - `TransformerBlock` = attn + ffn + norms
  - `MavenSLM` = embedding + n blocks + final norm + tied LM head
- [ ] `param_count()` utility to verify 50M budget
- [ ] Unit tests for forward pass shapes and causal mask correctness

### 1.2 Tokenizer
- [ ] Collect a 10 MB seed corpus from the training data (see Phase 2)
- [ ] Train a BPE tokenizer with `tokenizers` (HuggingFace) at 32,768 vocab
- [ ] Add special tokens: `<|bos|>`, `<|eos|>`, `<|pad|>`, `<|sep|>`,
  `<|lore|>`, `<|scene|>`, `<|style|>`, `<|inst|>`, `<|/inst|>`
- [ ] Writing-biased pre-tokenisation: preserve em-dash, ellipsis, dialogue quotes
- [ ] Export `maven-tokenizer/` for reuse in both training and Transformers.js

---

## Phase 2 — Training Data Pipeline  
*Estimated effort: 2–3 weeks*

### 2.1 Corpus Sources

| Source | Size (tokens est.) | License | Notes |
|---|---|---|---|
| Project Gutenberg fiction (pre-1928) | ~4 B | Public domain | English novels, varied genres |
| BookCorpus-style scrape | ~1 B | Check per-title | Romance, thriller, sci-fi |
| WikiText-103 (narrative sections) | ~0.1 B | CC | Background knowledge |
| WritingPrompts Reddit dataset | ~0.2 B | Varies | Diverse short fiction |
| Lore document pairs (synthetic) | ~50 M | Generated | World-building context injection |
| Instruction pairs for fine-tuning | ~10 M | Generated | Maven task format |

**Target pre-train tokens: ~5 B** (standard minimum for quality at 50M params per
Chinchilla scaling: optimal tokens ≈ 20× params → 1B, but 5B gives headroom)

### 2.2 Preprocessing Pipeline
- [ ] Download and deduplicate sources (`datasketch` MinHash LSH)
- [ ] Quality filters:
  - Minimum 200 tokens per document
  - Remove boilerplate (chapter headers repeated verbatim, OCR artefacts)
  - Language filter: English only (`langdetect`)
  - Perplexity filter: discard documents scoring >5σ from genre mean
- [ ] Format documents with structural tokens:
  ```
  <|bos|><|scene|> {content} <|eos|>
  <|bos|><|lore|> {world_entry} <|sep|> {related_scene} <|eos|>
  ```
- [ ] Tokenise and shard into `train/` (98%), `val/` (1%), `test/` (1%)
- [ ] Store as memory-mapped `.bin` files (uint16 token ids) for fast DataLoader

### 2.3 Instruction Fine-Tuning Data
- [ ] Generate ~50k instruction pairs covering Maven tasks:
  - **Continue scene:** `Given scene so far + lore context → next 200 words`
  - **Style match:** `Sample prose + instruction → continuation in same voice`
  - **Lore-grounded:** `World entry facts + partial scene → lore-consistent text`
  - **Outline expand:** `Bullet outline → prose scene`
  - **Lore sentinel:** `Scene text → identify lore changes as JSON`
- [ ] Use Llama 3.1 70B (via Ollama locally) as synthetic data generator
- [ ] Human-review 5% sample for quality gate before training

---

## Phase 3 — Pre-Training  
*Estimated effort: 1–4 weeks depending on hardware*

### 3.1 Training Infrastructure
- [ ] `train.py` using HuggingFace `Trainer` or `accelerate` + custom loop
- [ ] Mixed-precision: `bfloat16` (Ampere+) or `float16` + GradScaler
- [ ] Gradient checkpointing to fit on single 24 GB GPU (RTX 3090/4090)
- [ ] Cosine LR schedule with 2k warmup steps
- [ ] AdamW: lr=3e-4, β=(0.9, 0.95), weight_decay=0.1, grad_clip=1.0
- [ ] Context packing: bin-pack documents up to 2048 tokens per example

### 3.2 Training Run
- [ ] Batch size: 512 (gradient-accumulated from micro-batch of 4)
- [ ] ~10k steps on full corpus ≈ 5B tokens
- [ ] Checkpoint every 500 steps
- [ ] Log to WandB: loss, perplexity, grad norm, throughput (tokens/sec)
- [ ] Target validation loss: <3.0 (competitive for 50M on fiction)

### 3.3 Evaluation
- [ ] Perplexity on held-out test split
- [ ] Human eval sample: 50 randomly continued scenes scored 1–5
- [ ] Lore grounding test: does model use injected `<|lore|>` context correctly?

---

## Phase 4 — Instruction Fine-Tuning  
*Estimated effort: 3–5 days*

### 4.1 SFT (Supervised Fine-Tuning)
- [ ] Format: `<|inst|> {task instruction} <|/inst|> {response} <|eos|>`
- [ ] Fine-tune on 50k instruction pairs for 3 epochs
- [ ] Lower LR (3e-5), no warmup needed
- [ ] Only compute loss on response tokens (mask instruction)

### 4.2 Task-Specific Adapters (LoRA — optional v2)
- [ ] If base SFT quality is insufficient, add LoRA (r=16, α=32) per task head:
  - `maven-continue` — scene continuation
  - `maven-lore` — lore-grounded generation
  - `maven-sentinel` — structured lore detection
- [ ] Keeps base weights frozen; swappable adapters in browser

---

## Phase 5 — Export & Optimization  
*Estimated effort: 3–5 days*

### 5.1 ONNX Export (for Transformers.js / browser)
- [ ] `export_onnx.py`: export with `torch.onnx.export` using dynamic shapes
- [ ] Fuse QKV projections for inference speed
- [ ] Quantize to **int8** (ONNX Runtime static quantisation) → target ~48 MB
- [ ] Validate ONNX output matches PyTorch output within 1e-3 tolerance
- [ ] Package as HuggingFace-compatible model directory:
  ```
  maven-slm-50m-int8/
  ├── config.json
  ├── tokenizer.json
  ├── tokenizer_config.json
  ├── onnx/model.onnx       (~48 MB)
  └── onnx/model_quant.onnx  (~24 MB int4 optional)
  ```

### 5.2 GGUF Export (for Ollama compatibility)
- [ ] Convert via `llama.cpp` `convert_hf_to_gguf.py`
- [ ] Quantize to Q4_K_M (best quality/size ratio) → target ~30 MB
- [ ] Test `ollama run maven-slm` end-to-end
- [ ] Create `Modelfile` for Ollama with Maven system prompt baked in

### 5.3 Size Budget

| Format | Size | Use Case |
|---|---|---|
| FP32 weights | ~193 MB | Training reference |
| ONNX int8 | ~48 MB | Browser via Transformers.js |
| ONNX int4 | ~24 MB | Browser (lower quality) |
| GGUF Q4_K_M | ~30 MB | Ollama local server |

---

## Phase 6 — Scriptorium Integration  
*Estimated effort: 1–2 weeks*

### 6.1 New Service: `MavenModelService.ts`
- [ ] Wraps `@huggingface/transformers` `TextGenerationPipeline` for ONNX model
- [ ] Model download + caching via browser Cache API (same pattern as VectorService)
- [ ] Download progress callbacks for UI
- [ ] `generate(prompt, options)` → async token stream (ReadableStream)
- [ ] Cancellation via AbortSignal
- [ ] KV-cache management for multi-turn context
- [ ] Auto-detect WebGPU (`navigator.gpu`) for hardware acceleration; fallback to WASM

### 6.2 Update `RagService.ts`
- [ ] Abstract provider interface: `LLMProvider = OllamaProvider | MavenModelProvider`
- [ ] `MavenModelProvider` wraps `MavenModelService`
- [ ] `OllamaProvider` wraps existing `OllamaService`
- [ ] `RagService.buildMessages()` stays format-agnostic; provider handles chat template

### 6.3 Update `useAuthorAI.ts`
- [ ] Add `provider: 'ollama' | 'maven-slm'` state
- [ ] If Ollama unreachable, auto-suggest switching to MavenSLM
- [ ] Surface download progress during first-use model fetch
- [ ] Return `mavenModelStatus: 'not-downloaded' | 'downloading' | 'ready'`

### 6.4 UI Updates (MavenPanel)
- [ ] Model selector: `Ollama (external)` vs `MavenSLM (built-in, ~48 MB)`
- [ ] First-time download flow: progress bar, estimated size warning
- [ ] WebGPU badge if hardware acceleration active
- [ ] Offline indicator: "Running locally — no internet required"

### 6.5 Structured Output for Lore Sentinel
- [ ] MavenSLM fine-tuned on sentinel format:
  ```json
  {"proposals": [{"field": "status", "entry": "...", "newValue": "..."}]}
  ```
- [ ] `RagService.parseSentinelResponse()` already handles this format — no change needed

---

## Milestones & Recommended Order

```
Week 1–2   Phase 1: Model architecture + tokenizer
Week 3–5   Phase 2: Data pipeline + corpus assembly
Week 6–9   Phase 3: Pre-training run
Week 10    Phase 4: Instruction fine-tuning
Week 11    Phase 5: Export + quantization
Week 12–13 Phase 6: Scriptorium integration
```

---

## Hardware Requirements

| Task | Minimum | Recommended |
|---|---|---|
| Tokenizer training | CPU | CPU |
| Data preprocessing | 16 GB RAM | 32 GB RAM |
| Pre-training | RTX 3090 (24 GB) | 2× A100 (80 GB) |
| Fine-tuning | RTX 3090 | RTX 4090 |
| ONNX export | CPU | CPU |
| Browser inference | WebAssembly | WebGPU (RTX/M-series) |

**Cloud option:** ~$50–150 on RunPod / Lambda Labs for the full pre-training run
at $0.75–1.50/hr on A100 × 40 hrs.

---

## Open Questions for Decision

1. **Train from scratch vs. fine-tune DistilGPT-2?**  
   Training from scratch gives full architecture control + writing-domain bias from
   token 1. Fine-tuning an existing checkpoint is faster but inherits a general-
   purpose vocab and weights. Recommend: **train from scratch** given the custom
   tokenizer and structural tokens (`<|lore|>`, etc.) are non-negotiable.

2. **ONNX browser vs. GGUF Ollama as primary target?**  
   Scriptorium is offline-first — browser ONNX means zero external dependency.
   GGUF/Ollama is a fallback for power users. Recommend: **ONNX browser-first**,
   ship GGUF as optional Ollama model.

3. **Single model vs. base + LoRA adapters?**  
   A single SFT model is simpler. LoRA adapters allow task specialisation without
   multiplying model size. Recommend: **ship single SFT model first**, add LoRA
   in a v2 if generation quality needs improvement per task.

4. **Corpus licensing?**  
   All Project Gutenberg titles are public domain (pre-1928 US publications).
   WritingPrompts data needs a licence audit. Any synthetic data generated via
   Llama models must comply with Meta's acceptable use policy.
