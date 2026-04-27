# MeyvnSLM — Custom 75M Parameter Writing Assistant Model

**Goal:** Build, train, and ship a custom small language model (SLM) purpose-built
for MeyvnAi's writing-assistant tasks — story continuation, style matching, lore
integration, and outline expansion — running fully offline inside Scriptorium.

---

## Architecture Specification

**Name:** MeyvnSLM-75M  
**Type:** Decoder-only causal transformer (GPT-style)  
**Parameter target:** ~73–77 M  

| Hyperparameter | Value | Rationale |
|---|---|---|
| `d_model` | 576 | Balanced capacity vs. memory |
| `n_heads` | 9 | 64-dim per head, standard for d_model=576 |
| `n_layers` | 13 | Hits ~75M with the other dims |
| `ffn_dim` | 1728 | 3× d_model — SwiGLU uses 3 weight matrices (gate/up/down), so 1728 keeps total params near 75 M |
| `vocab_size` | 32,768 | BPE, writing-optimised |
| `max_seq_len` | 2,048 | Full scene + lore context window |
| `dropout` | 0.1 | Regularisation during pre-train |
| `activation` | SwiGLU | Better loss vs. ReLU at small scale |
| `norm` | RMSNorm | Faster, numerically stable |
| `pos_encoding` | RoPE | Length generalisation beyond training |

**Exact parameter budget:**

| Component | Params |
|---|---|
| Token embeddings (32768 × 576) | 18,874,368 |
| Rotary position — RoPE (no learned params) | 0 |
| 13× attention Q,K,V,O (each 576²) | 17,252,352 |
| 13× SwiGLU FFN — gate+up (576×1728×2) + down (1728×576) | 38,817,792 |
| 13× RMSNorm pairs pre-attn + pre-ffn (2 × 576 each) | 14,976 |
| Final RMSNorm | 576 |
| LM head (weight-tied to embedding — no extra params) | 0 |
| **Total unique** | **~74,960,064 ≈ 75.0 M** |

Note: SwiGLU uses three weight matrices per FFN block (gate, up, down) rather
than two. Setting `ffn_dim = 3 × d_model = 1728` compensates and keeps the
total at ~75 M. A standard 2-matrix FFN would use `ffn_dim = 4 × d_model = 2304`.

---

## Phase 1 — Architecture & Tokenizer  
*Estimated effort: 1–2 weeks*

### 1.1 Python Model Implementation
- [ ] Create `meyvn_slm/` Python package (separate from Scriptorium frontend)
- [ ] Implement `MeyvnSLMConfig` dataclass (all hyperparams above)
- [ ] Implement `MeyvnSLM` in PyTorch:
  - `RMSNorm` layer
  - `RotaryEmbedding` (RoPE, precomputed freqs)
  - `SwiGLU` FFN block
  - `CausalSelfAttention` (grouped-query optional for v2)
  - `TransformerBlock` = attn + ffn + norms
  - `MeyvnSLM` = embedding + n blocks + final norm + tied LM head
- [ ] `param_count()` utility to verify 75M budget
- [ ] Unit tests for forward pass shapes and causal mask correctness

### 1.2 Tokenizer
- [ ] Collect a 10 MB seed corpus from the training data (see Phase 2)
- [ ] Train a BPE tokenizer with `tokenizers` (HuggingFace) at 32,768 vocab
- [ ] Add special tokens: `<|bos|>`, `<|eos|>`, `<|pad|>`, `<|sep|>`,
  `<|lore|>`, `<|scene|>`, `<|style|>`, `<|inst|>`, `<|/inst|>`
- [ ] Writing-biased pre-tokenisation: preserve em-dash, ellipsis, dialogue quotes
- [ ] Export `meyvn-tokenizer/` for reuse in both training and Transformers.js

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
| Instruction pairs for fine-tuning | ~10 M | Generated | Meyvn task format |

**Target pre-train tokens: ~1.5 B** (Chinchilla-optimal for 75M params: 20× params → 1.5B tokens exactly)

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
- [ ] Generate ~50k instruction pairs covering Meyvn tasks:
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
- [ ] ~3k steps on corpus ≈ 1.5B tokens
- [ ] Checkpoint every 500 steps
- [ ] Log to WandB: loss, perplexity, grad norm, throughput (tokens/sec)
- [ ] Target validation loss: <3.0 (competitive for 75M on fiction)

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
  - `meyvn-continue` — scene continuation
  - `meyvn-lore` — lore-grounded generation
  - `meyvn-sentinel` — structured lore detection
- [ ] Keeps base weights frozen; swappable adapters in browser

---

## Phase 5 — Export & Optimization  
*Estimated effort: 3–5 days*

### 5.1 ONNX Export (for Transformers.js / browser)
- [ ] `export_onnx.py`: export with `torch.onnx.export` using dynamic shapes
- [ ] Fuse QKV projections for inference speed
- [ ] Quantize to **int8** (ONNX Runtime static quantisation) → target ~75 MB
- [ ] Validate ONNX output matches PyTorch output within 1e-3 tolerance
- [ ] Package as HuggingFace-compatible model directory:
  ```
  meyvn-slm-75m-int8/
  ├── config.json
  ├── tokenizer.json
  ├── tokenizer_config.json
  ├── onnx/model.onnx       (~75 MB)
  └── onnx/model_quant.onnx  (~38 MB int4 optional)
  ```

### 5.2 GGUF Export (for Ollama compatibility)
- [ ] Convert via `llama.cpp` `convert_hf_to_gguf.py`
- [ ] Quantize to Q4_K_M (best quality/size ratio) → target ~45 MB
- [ ] Test `ollama run meyvn-slm` end-to-end
- [ ] Create `Modelfile` for Ollama with Meyvn system prompt baked in

### 5.3 Size Budget

| Format | Size | Use Case |
|---|---|---|
| FP32 weights | ~300 MB | Training reference |
| ONNX int8 | ~75 MB | Browser via Transformers.js |
| ONNX int4 | ~38 MB | Browser (lower quality) |
| GGUF Q4_K_M | ~45 MB | Ollama local server |

---

## Phase 6 — Scriptorium Integration  
*Estimated effort: 1–2 weeks*

### 6.1 New Service: `MeyvnModelService.ts`
- [ ] Wraps `@huggingface/transformers` `TextGenerationPipeline` for ONNX model
- [ ] Model download + caching via browser Cache API (same pattern as VectorService)
- [ ] Download progress callbacks for UI
- [ ] `generate(prompt, options)` → async token stream (ReadableStream)
- [ ] Cancellation via AbortSignal
- [ ] KV-cache management for multi-turn context
- [ ] Auto-detect WebGPU (`navigator.gpu`) for hardware acceleration; fallback to WASM

### 6.2 Update `RagService.ts`
- [ ] Abstract provider interface: `LLMProvider = OllamaProvider | MeyvnModelProvider`
- [ ] `MeyvnModelProvider` wraps `MeyvnModelService`
- [ ] `OllamaProvider` wraps existing `OllamaService`
- [ ] `RagService.buildMessages()` stays format-agnostic; provider handles chat template

### 6.3 Update `useAuthorAI.ts`
- [ ] Add `provider: 'ollama' | 'maven-slm'` state
- [ ] If Ollama unreachable, auto-suggest switching to MeyvnSLM
- [ ] Surface download progress during first-use model fetch
- [ ] Return `mavenModelStatus: 'not-downloaded' | 'downloading' | 'ready'`

### 6.4 UI Updates (MeyvnPanel)
- [ ] Model selector: `Ollama (external)` vs `MeyvnSLM (built-in, ~75 MB)`
- [ ] First-time download flow: progress bar, estimated size warning
- [ ] WebGPU badge if hardware acceleration active
- [ ] Offline indicator: "Running locally — no internet required"

### 6.5 Structured Output for Lore Sentinel
- [ ] MeyvnSLM fine-tuned on sentinel format:
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
| Pre-training | MacBook Pro M2/M3 Pro 24 GB | 2× A100 (80 GB) |
| Fine-tuning | MacBook Pro M2/M3 Pro 24 GB | RTX 4090 |
| ONNX export | CPU | CPU |
| Browser inference | WebAssembly | WebGPU (RTX/M-series) |

**Cloud option:** ~$50–150 on RunPod / Lambda Labs for the full pre-training run
at $0.75–1.50/hr on A100 × 40 hrs.

---

## Apple Silicon Training Guide (MacBook Pro 24 GB Unified RAM)

### Memory — Not a concern at all
The 75M param model is tiny relative to 24 GB unified RAM:

| Component | Memory |
|---|---|
| Model weights (bfloat16) | ~150 MB |
| AdamW optimizer states (fp32) | ~600 MB |
| Gradients (bfloat16) | ~150 MB |
| Activations + grad checkpoint | ~300 MB |
| PyTorch + framework overhead | ~1.5 GB |
| **Total peak** | **~2.7 GB** |

You have ~21 GB headroom. Memory is not the bottleneck.

### Training Speed — M5 is excellent for this task

Apple Silicon uses PyTorch's **MPS (Metal Performance Shaders)** backend.
The M5 generation is meaningfully faster than M3/M4 for ML workloads.

> **Note:** Confirmed M5 benchmarks for PyTorch ML training are still
> emerging. The numbers below are extrapolated from the M4 generation
> using Apple's typical ~30–40% GPU throughput improvement per generation.
> Run a quick `python train_benchmark.py` (small 100-step warmup) on your
> actual machine to calibrate before committing to a full run.

| Chip | GPU Cores (est.) | Mem BW (est.) | Est. tokens/sec | 1.5B tokens |
|---|---|---|---|---|
| M4 Pro (ref) | 20 | 273 GB/s | ~60–90k | 4.5–7 hrs |
| **M5 Pro** | **~24–28** | **~350–400 GB/s** | **~90–130k** | **~3–4.5 hrs** |
| **M5 Max** | **~40–48** | **~600–700 GB/s** | **~180–250k** | **~1.5–2.5 hrs** |
| A100 80GB (cloud ref) | — | 2,000 GB/s | ~500k+ | ~50 min |

**With 24 GB of unified RAM you almost certainly have an M5 Pro.**
At ~90–130k tokens/sec, the full 1.5B token pre-training run completes in
**roughly 3–4.5 hours** — fast enough to iterate and re-run if needed.

**Recommendation: train on 1.5B tokens.**  
Chinchilla scaling says optimal for 75M params is exactly 1.5B tokens (20× params).
This is the ideal compute-optimal point — maximum quality gain per GPU-hour.

### Required code changes for MPS

1. **Device target:** `device = torch.device("mps")` instead of `"cuda"`
2. **No Flash Attention 2** — CUDA-only kernel. Use standard scaled dot-product
   attention (`F.scaled_dot_product_attention`) which has an MPS implementation.
3. **bfloat16 support:** Available on M2+ chips. M1 requires float16 instead.
4. **DataLoader:** Set `num_workers=0` — MPS does not support forked workers.
5. **Batch size:** Start at micro-batch=2 with gradient accumulation to 256.
   Tune upward if memory headroom allows.
6. **Thermal management:** Plug in to power. Run overnight for long pre-train
   phases. macOS may throttle the GPU after sustained heavy load — monitor with
   `sudo powermetrics --samplers gpu_power -i 1000`.

### Practical training schedule on Mac

```
Phase 3 pre-train  (1.5B tokens, micro-batch 2, grad-accum 128):
  M3 Pro:  ~7–10 days  (run overnight × 5–6 nights, check each morning)
  M3 Max:  ~3–4 days
  M5 Pro:  ~3–4.5 hrs  (single session)
  M5 Max:  ~1.5–2.5 hrs (single session)

Phase 4 fine-tune  (50k instruction pairs × 3 epochs ≈ ~15M tokens):
  M3 Pro:  ~3–5 hours
  M3 Max:  ~1–2 hours
```

### Keeping the Mac healthy during training
- Plug into power (never train on battery — thermal throttling kicks in)
- Keep ambient temperature cool; prop laptop on a stand for airflow
- Disable sleep: `sudo pmset -a sleep 0` before the run, restore after
- Use `caffeinate -s python train.py` to prevent idle sleep mid-run

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
