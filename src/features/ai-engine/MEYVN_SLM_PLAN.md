# MeyvnSLM — Custom 3B Parameter Writing Assistant Model

**Goal:** Build, train, and ship a custom large language model purpose-built
for MeyvnAi's writing-assistant tasks — story continuation, style matching, lore
integration, and outline expansion — running fully offline inside Scriptorium.

---

## Architecture Specification

**Name:** MeyvnSLM-3B  
**Type:** Decoder-only causal transformer (GPT-style) with optional BitLinear 1.58-bit quantization  
**Parameter target:** ~2.97–3.0 B  

| Hyperparameter | Value | Rationale |
|---|---|---|
| `d_model` | 2,560 | Provides sufficient capacity for long-form writing tasks |
| `n_heads` | 20 | 128-dim per head — standard for this model class |
| `n_layers` | 34 | Hits ~2.98 B with the other dims |
| `ffn_dim` | 7,680 | 3× d_model — SwiGLU uses 3 weight matrices (gate/up/down), so 7680 keeps total params near 3 B |
| `vocab_size` | 32,768 | BPE, writing-optimised |
| `max_seq_len` | 2,048 | Full scene + lore context window |
| `dropout` | 0.1 | Regularisation during pre-train |
| `activation` | SwiGLU | Better loss vs. ReLU/GELU at this scale |
| `norm` | RMSNorm (ε=1e-8) | Tighter epsilon for pre-quantization stability |
| `pos_encoding` | RoPE | Length generalisation beyond training |
| `quantization` | BitLinear 1.58-bit (optional) | Ternary {-1, 0, +1} weights via STE QAT |

**Exact parameter budget:**

| Component | Params |
|---|---|
| Token embeddings (32768 × 2560) | 83,886,080 |
| Rotary position — RoPE (no learned params) | 0 |
| 34× attention Q,K,V,O (each 2560²) | 891,289,600 |
| 34× SwiGLU FFN — gate+up (2560×7680×2) + down (7680×2560) | 2,005,401,600 |
| 34× RMSNorm pairs pre-attn + pre-ffn (2 × 2560 each) | 174,080 |
| Final RMSNorm | 2,560 |
| LM head (weight-tied to embedding — no extra params) | 0 |
| **Total unique** | **~2,980,753,920 ≈ 2.98 B** |

Note: SwiGLU uses three weight matrices per FFN block (gate, up, down) rather
than two. Setting `ffn_dim = 3 × d_model = 7680` compensates and keeps the
total at ~3 B. A standard 2-matrix FFN would use `ffn_dim = 4 × d_model = 10240`.

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
- [ ] `param_count()` utility to verify 3B budget
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

**Target pre-train tokens: ~60 B** (Chinchilla-optimal for 3B params: 20× params → 60B tokens exactly)

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
- [ ] Batch size: 524,288 tokens/step (micro-batch 4 × grad-accum 64 × block 2048)
- [ ] ~114,500 steps ≈ 60B tokens (Chinchilla-optimal for 3B params)
- [ ] Checkpoint every 500 steps
- [ ] Log to WandB: loss, perplexity, grad norm, throughput (tokens/sec)
- [ ] Target validation loss: <2.5 (competitive for 3B on fiction)

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
- [ ] Quantize to **int4** (ONNX Runtime static quantisation) → target ~1.5 GB
  - int8 (~2.9 GB) is too large for comfortable browser delivery; use int4 as primary
- [ ] Validate ONNX output matches PyTorch output within 1e-3 tolerance
- [ ] Package as HuggingFace-compatible model directory:
  ```
  meyvn-slm-3b-int4/
  ├── config.json
  ├── tokenizer.json
  ├── tokenizer_config.json
  ├── onnx/model.onnx        (~2.9 GB int8)
  └── onnx/model_quant.onnx  (~1.5 GB int4 — primary browser target)
  ```

### 5.2 GGUF Export (for Ollama compatibility)
- [ ] Convert via `llama.cpp` `convert_hf_to_gguf.py`
- [ ] Quantize to Q4_K_M (best quality/size ratio) → target ~1.7 GB
- [ ] Test `ollama run meyvn-slm` end-to-end
- [ ] Create `Modelfile` for Ollama with Meyvn system prompt baked in

### 5.3 Size Budget

| Format | Size | Use Case |
|---|---|---|
| FP32 weights | ~11.4 GB | Training reference only |
| BF16 weights | ~5.7 GB | Fine-tuning / checkpoint |
| ONNX int8 | ~2.9 GB | Browser (high-end WebGPU) |
| ONNX int4 | ~1.5 GB | Browser primary (Transformers.js + WebGPU) |
| GGUF Q4_K_M | ~1.7 GB | Ollama local server — recommended |
| GGUF Q2_K | ~0.9 GB | Ollama (lower quality, fast on CPU) |

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
- [ ] Model selector: `Ollama (external)` vs `MeyvnSLM (built-in, ~1.5 GB int4 — requires WebGPU)`
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
Week 3–6   Phase 2: Data pipeline + corpus assembly (60B tokens needs significant storage)
Week 7–9   Phase 3: Pre-training run (4× A100, ~4 days compute; rest is queueing + monitoring)
Week 10    Phase 4: Instruction fine-tuning (A100 or M5 Max)
Week 11    Phase 5: Export + quantisation (GGUF Q4_K_M, ONNX int4)
Week 12–14 Phase 6: Scriptorium integration + WebGPU inference pipeline
```

---

## Hardware Requirements

| Task | Minimum | Recommended |
|---|---|---|
| Tokenizer training | CPU 8 GB RAM | CPU 32 GB RAM |
| Data preprocessing | 32 GB RAM | 64 GB RAM |
| Pre-training (60B tokens) | 1× A100 80GB (~14.6 days) | 4–8× A100 80GB (2–4 days) |
| Fine-tuning (full) | M5 Max 48 GB + 8-bit optimizer | 1× A100 80GB |
| Fine-tuning (LoRA r=64) | M5 Pro 24 GB | RTX 4090 24 GB |
| ONNX export | CPU 32 GB RAM | CPU 64 GB RAM |
| Browser inference | WebGPU + 8 GB VRAM (int4) | Apple M-series / RTX 4070+ |
| Ollama inference | 8 GB RAM (Q2_K) | 16 GB RAM (Q4_K_M) |

**Cloud training cost:**
- 1× A100 80GB × 350 hrs ≈ **$525–875** at $1.50–2.50/hr (RunPod / Lambda)
- 4× A100 80GB × 90 hrs ≈ **$540–900** (data-parallel, ~4× faster)
- H100 80GB × 175 hrs ≈ **$875–1,400** (1.5–2× A100 throughput per GPU)

---

## Apple Silicon Guide (Fine-Tuning & Inference)

Pre-training MeyvnSLM-3B on Apple Silicon is not practical — see the
hardware table above. Apple Silicon M5 Max/Ultra is ideal for:
- **LoRA fine-tuning** on the instruction dataset after cloud pre-training
- **ONNX export and quantisation** (CPU-bound, no GPU required)
- **Running inference** via Ollama (GGUF Q4_K_M) or Transformers.js (int4)

### Memory — the primary constraint at 3B scale

**Standard AdamW (fp32 optimizer states) — requires A100 80GB:**

| Component | Memory |
|---|---|
| Model weights (bfloat16) | ~5.6 GB |
| AdamW m + v states (fp32) | ~22.4 GB |
| Gradients (bfloat16) | ~5.6 GB |
| Activations + grad checkpoint | ~2–4 GB |
| PyTorch + framework overhead | ~2 GB |
| **Total peak** | **~38–40 GB** |

**8-bit optimizer (bitsandbytes) — fits M5 Max 48 GB or A100 40 GB:**

| Component | Memory |
|---|---|
| Model weights (bfloat16) | ~5.6 GB |
| 8-bit AdamW states | ~5.6 GB |
| Gradients (bfloat16) | ~5.6 GB |
| Activations + grad checkpoint | ~2 GB |
| PyTorch + framework overhead | ~2 GB |
| **Total peak** | **~21 GB** |

M5 Pro (24 GB): technically fits with 8-bit optimizer + micro-batch 1, but
throughput is ~200 tok/s — 60B tokens would take ~3,472 days. Use for
inference, LoRA fine-tuning, or ONNX export only.

### Training throughput — A100 is the target hardware

At 3B parameters, Apple Silicon MPS is not practical for pre-training.
The numbers below assume a single device with gradient checkpointing enabled
and `micro_batch_size=4`, `block_size=2048`.

| Hardware | Est. tok/s (training) | 60B tokens | Notes |
|---|---|---|---|
| M5 Pro 24 GB | ~200 | ~3,500 days | Inference / LoRA fine-tune only |
| M5 Max 48 GB | ~500 | ~1,389 days | Fine-tuning only |
| M5 Ultra 192 GB | ~1,200 | ~578 days | Fine-tuning / small runs only |
| RTX 4090 24 GB | ~2,000 | ~347 days | Feasible for LoRA, not pre-train |
| A100 40 GB SXM | ~8,000 | ~87 days | Use 4× for reasonable time |
| **A100 80 GB SXM** | **~12,000** | **~58 days (1×); ~14.6 days (4×)** | **Recommended** |
| H100 80 GB SXM | ~20,000 | ~35 days (1×); ~8.8 days (4×) | Fastest cloud option |

> Throughput estimates for 3B bf16 training with gradient checkpointing.
> Actual numbers vary ±30% based on batch size, memory bandwidth saturation,
> and driver/kernel versions. Run a 100-step warmup benchmark first.

**Recommendation: use 4× A100 80GB on RunPod / Lambda Labs.**
~$540–900 total for the full Chinchilla-optimal 60B token run (~90 hrs).
Apple Silicon M5 Max/Ultra is the right machine for fine-tuning, ONNX export,
and running inference — not 60B-token pre-training.

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
Phase 3 pre-train  (60B tokens, micro-batch 4, grad-accum 64, block 2048):
  1× A100 80GB  : ~14.6 days    ← minimum viable (cloud)
  4× A100 80GB  : ~3.7 days     ← recommended
  8× A100 80GB  : ~1.9 days     ← fastest reasonable cloud config
  1× H100 80GB  : ~8.8 days
  4× H100 80GB  : ~2.2 days

  Apple Silicon (for reference / fine-tuning only):
  M5 Pro 24 GB  : not recommended for pre-training
  M5 Max 48 GB  : suitable for LoRA fine-tuning only

Phase 4 fine-tune  (50k instruction pairs × 3 epochs ≈ ~15M tokens):
  1× A100 80GB  : ~2–4 hours
  M5 Max 48 GB  : ~6–10 hours (with 8-bit optimizer)
  M5 Pro 24 GB  : ~12–20 hours (LoRA r=64, 8-bit optimizer)
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
