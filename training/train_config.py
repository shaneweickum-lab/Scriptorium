"""Training hyperparameters for MeyvnSLM-3B pre-training.

Defaults are tuned for a single NVIDIA A100 80GB (cloud / workstation).
For Apple Silicon, see the hardware notes section below.

Effective batch size = micro_batch_size × grad_accum_steps × block_size
                     = 4 × 64 × 2048 = 524,288 tokens per gradient update.
Steps for 1.5B pilot tokens ≈ 1.5B / 524,288 ≈ 2,861 → max_steps = 3,000.

──────────────────────────────────────────────────────────────────────────────
Chinchilla scaling note
──────────────────────────────────────────────────────────────────────────────
Chinchilla-optimal for a 3B parameter model is 20 × 3B = 60B tokens.
The default max_steps=114,500 targets the full 60B token budget.

Effective batch = 4 × 64 × 2048 = 524,288 tokens/step
Steps for 60B  ≈ 60B / 524,288 ≈ 114,441 → max_steps = 114,500

Estimated training time at full Chinchilla budget:
  1× A100 80GB  : ~114,500 steps × ~11s/step ≈ ~14.6 days
  4× A100 80GB  : ~3.7 days  (data-parallel, linear scaling)
  8× A100 80GB  : ~1.9 days
  H100 80GB     : ~7 days    (1.5–2× A100 throughput)

Cloud cost estimate (RunPod / Lambda Labs ~$1.50–2.50/hr per A100):
  1× A100 × 350h ≈ $525–875
  4× A100 × 90h  ≈ $540–900
──────────────────────────────────────────────────────────────────────────────

──────────────────────────────────────────────────────────────────────────────
Hardware memory at 3B scale
──────────────────────────────────────────────────────────────────────────────
Memory breakdown (standard AdamW, bf16 weights):

  Component                    Memory
  ─────────────────────────── ──────────
  Model weights (bf16)         ~5.6 GB
  AdamW m + v states (fp32)    ~22.4 GB
  Gradients (bf16)             ~5.6 GB
  Activations (grad-ckpt)      ~2–4 GB
  Framework overhead           ~2 GB
  ─────────────────────────── ──────────
  Total peak                   ~38–40 GB   → A100 80GB comfortable ✓
                                           → RTX 4090 24GB ✗

With 8-bit optimizer (bitsandbytes) + gradient checkpointing:

  Component                    Memory
  ─────────────────────────── ──────────
  Model weights (bf16)         ~5.6 GB
  8-bit AdamW states           ~5.6 GB
  Gradients (bf16)             ~5.6 GB
  Activations (grad-ckpt)      ~2 GB
  Framework overhead           ~2 GB
  ─────────────────────────── ──────────
  Total peak                   ~21 GB      → M5 Pro 24GB (micro-batch=1) ⚠
                                           → M5 Max 48GB comfortable ✓
                                           → M5 Ultra 192GB ✓

Apple Silicon note: M5 Pro (24GB) is at the memory limit at 3B scale.
Training is feasible but impractical due to throughput:
  M5 Pro  (~200 tok/s)  → 1.5B tokens ≈ 87 days   ✗
  M5 Max  (~500 tok/s)  → 1.5B tokens ≈ 35 days   ✗ (pilot only)
  M5 Max  (~500 tok/s)  → 30B tokens  ≈ 694 days  ✗

Recommendation: use A100 cloud (RunPod / Lambda Labs) for pre-training.
Apple Silicon M5 Max / Ultra is ideal for fine-tuning, ONNX export, and
running inference after training.
──────────────────────────────────────────────────────────────────────────────

──────────────────────────────────────────────────────────────────────────────
BitLinear 1.58-bit learning rate notes
──────────────────────────────────────────────────────────────────────────────
Ternary QAT at 3B scale: same instability modes as smaller models, but
the longer training run amplifies their consequences. Extended warmup
is even more critical at this scale.

  1. Threshold ping-pong: shadow weights near |w/γ| ≈ 0.5 flip each step.
     Fix: max_lr = 1e-4, bitlinear_lr_scale = 0.5 in make_optimizer_groups.

  2. Zero collapse: γ shrinks → more weights round to 0 → sparse projection.
     Fix: 300-step warmup (10%), weight_decay = 0.1.

Recommended settings for full BitLinear pre-training:
  • max_lr = 1e-4
  • warmup_steps = 300 (10% of pilot run)
  • weight_decay = 0.1
  • grad_clip = 1.0

Monitor model.ternary_health_check() every 500 steps:
  • Healthy zero_pct: 25–55%
  • If zero_pct > 60% for >3 consecutive checkpoints: halve the LR
  • If zero_pct < 15%: raise weight_decay to 0.15
──────────────────────────────────────────────────────────────────────────────
"""

from dataclasses import dataclass


@dataclass
class TrainConfig:
    # ------------------------------------------------------------------
    # Data
    # ------------------------------------------------------------------
    data_dir: str      = "data/tokenized"
    tokenizer_dir: str = "tokenizer/meyvn-tokenizer"

    # ------------------------------------------------------------------
    # Sequence / batch
    # ------------------------------------------------------------------
    block_size: int        = 2048   # tokens per sample = model max_seq_len
    micro_batch_size: int  = 4      # sequences per forward pass (A100 80GB)
    grad_accum_steps: int  = 64     # accumulate before optimizer step
    # effective_batch_tokens = 4 × 64 × 2048 = 524,288 ≈ 0.5 M

    # Apple Silicon override (use with 8-bit optimizer):
    #   micro_batch_size = 1, grad_accum_steps = 64, block_size = 1024
    #   effective = 65,536 tokens/step; 1.5B tokens ≈ 22,888 steps

    # ------------------------------------------------------------------
    # Training duration — full Chinchilla-optimal 60B token run
    # 114,500 × 524,288 ≈ 60.0 B tokens  (20× params for 3B model)
    # ------------------------------------------------------------------
    max_steps: int    = 114_500
    warmup_steps: int = 5_000   # ~4.4% warmup — longer run, longer ramp

    # ------------------------------------------------------------------
    # Optimiser (AdamW)
    # ------------------------------------------------------------------
    # 1e-4 for BitLinear runs; 3e-4 for full-precision runs.
    # BitLinear shadow weights get an additional 0.5× scale via
    # MeyvnSLM.make_optimizer_groups — effective LR on ternary layers ≈ 5e-5.
    max_lr: float       = 1e-4
    min_lr: float       = 1e-5     # 10% of max_lr (cosine floor)
    weight_decay: float = 0.1
    beta1: float        = 0.9
    beta2: float        = 0.95
    grad_clip: float    = 1.0

    # BitLinear differential LR scale (applied in make_optimizer_groups).
    bitlinear_lr_scale: float = 0.5

    # Use 8-bit optimizer to halve optimizer memory (required on M5 Pro,
    # recommended on any GPU with <40 GB VRAM). Requires bitsandbytes.
    use_8bit_optimizer: bool = False   # set True for M5 Pro / <40GB GPU

    # ------------------------------------------------------------------
    # Logging and checkpointing
    # ------------------------------------------------------------------
    log_interval: int            = 1
    val_interval: int            = 250
    val_steps: int               = 50
    sample_interval: int         = 500
    checkpoint_interval: int     = 500
    checkpoint_dir: str          = "checkpoints"
    keep_last_n_checkpoints: int = 3

    ternary_health_interval: int = 500

    # ------------------------------------------------------------------
    # Weights & Biases
    # ------------------------------------------------------------------
    use_wandb: bool     = False
    wandb_project: str  = "meyvn-slm"
    wandb_run_name: str = ""

    # ------------------------------------------------------------------
    # Misc
    # ------------------------------------------------------------------
    seed: int     = 42
    device: str   = ""      # auto-detect: cuda > mps > cpu
    compile: bool = False   # torch.compile — CUDA only, not MPS

    def effective_batch_tokens(self) -> int:
        return self.micro_batch_size * self.grad_accum_steps * self.block_size

    def estimated_total_tokens(self) -> int:
        return self.max_steps * self.effective_batch_tokens()

    def __post_init__(self) -> None:
        assert self.warmup_steps < self.max_steps
        assert self.min_lr <= self.max_lr
        assert self.micro_batch_size >= 1
        assert self.grad_accum_steps >= 1
