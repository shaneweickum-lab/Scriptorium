"""Training hyperparameters for MeyvnSLM-100M pre-training.

Defaults run well on Apple Silicon M5 Pro/Max and single-GPU workstations.
A100 cloud is optional — the 100M scale fits comfortably on consumer hardware.

Effective batch size = micro_batch_size × grad_accum_steps × block_size
                     = 4 × 16 × 2048 = 131,072 tokens per gradient update.

──────────────────────────────────────────────────────────────────────────────
Token budget note
──────────────────────────────────────────────────────────────────────────────
Chinchilla-optimal for 100M params = 20 × 100M = 2B tokens.
We train to 2.5B (25% over-trained vs Chinchilla) for extra convergence margin.

Effective batch = 4 × 16 × 2048 = 131,072 tokens/step
Steps for 2.5B ≈ 2.5B / 131,072 ≈ 19,073 → max_steps = 19,073

Estimated training time:
  M5 Pro 24 GB  : ~6 days   (MPS, micro-batch=4)
  M5 Max 48 GB  : ~3 days   (MPS, micro-batch=8)
  RTX 4090 24GB : ~18 hours
  1× A100 80GB  : ~10 hours

Cloud cost estimate (RunPod / Lambda Labs ~$1.50–2.50/hr per A100):
  1× A100 × 10h ≈ $15–25   (< $30 total — far below 3B scale)
──────────────────────────────────────────────────────────────────────────────

──────────────────────────────────────────────────────────────────────────────
Hardware memory at 100M scale
──────────────────────────────────────────────────────────────────────────────
Memory breakdown (standard AdamW, bf16 weights):

  Component                    Memory
  ─────────────────────────── ──────────
  Model weights (bf16)         ~0.19 GB
  AdamW m + v states (fp32)    ~0.76 GB
  Gradients (bf16)             ~0.19 GB
  Activations (micro-batch=4)  ~0.5 GB
  Framework overhead           ~1 GB
  ─────────────────────────── ──────────
  Total peak                   ~2.5–3 GB  → any Apple Silicon ✓
                                           → any GPU ≥ 4 GB VRAM ✓

No gradient checkpointing required. No 8-bit optimizer required.
This model trains comfortably on M5 Pro, M5 Max, RTX 3080, or any A100.

Apple Silicon MPS note: 100M is fully practical for pre-training on-device.
  M5 Pro 24 GB  (~4,000 tok/s)  → 2.5B tokens ≈ 7.2 days   ✓
  M5 Max 48 GB  (~8,000 tok/s)  → 2.5B tokens ≈ 3.6 days   ✓
  M5 Ultra 192 GB (~14,000 tok/s) → 2.5B tokens ≈ 2 days   ✓
──────────────────────────────────────────────────────────────────────────────

──────────────────────────────────────────────────────────────────────────────
BitLinear 1.58-bit learning rate notes
──────────────────────────────────────────────────────────────────────────────
  1. Threshold ping-pong: shadow weights near |w/γ| ≈ 0.5 flip each step.
     Fix: max_lr = 1e-4, bitlinear_lr_scale = 0.5 in make_optimizer_groups.

  2. Zero collapse: γ shrinks → more weights round to 0 → sparse projection.
     Fix: 1000-step warmup (~5%), weight_decay = 0.1.

Recommended settings for BitLinear pre-training:
  • max_lr = 1e-4
  • warmup_steps = 1,000
  • weight_decay = 0.1
  • grad_clip = 1.0

Default max_lr = 3e-4 targets full-precision (non-BitLinear) training.
For BitLinear runs, override max_lr = 1e-4 via CLI or config override.

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
    micro_batch_size: int  = 4      # sequences per forward pass
    grad_accum_steps: int  = 16     # accumulate before optimizer step
    # effective_batch_tokens = 4 × 16 × 2048 = 131,072 ≈ 128 K

    # Apple Silicon override for fastest throughput:
    #   micro_batch_size = 8, grad_accum_steps = 16
    #   effective = 262,144 tokens/step; halves wall-clock time

    # ------------------------------------------------------------------
    # Training duration — 2.5B token run (25% above Chinchilla for 100M)
    # 19,073 × 131,072 ≈ 2.499 B tokens
    # ------------------------------------------------------------------
    max_steps: int    = 19_073
    warmup_steps: int = 1_000   # ~5.2% warmup

    # ------------------------------------------------------------------
    # Optimiser (AdamW)
    # ------------------------------------------------------------------
    # 3e-4 for full-precision runs; override to 1e-4 for BitLinear runs.
    # BitLinear shadow weights get an additional 0.5× scale via
    # MeyvnSLM.make_optimizer_groups — effective LR on ternary layers ≈ 5e-5.
    max_lr: float       = 3e-4
    min_lr: float       = 3e-5     # 10% of max_lr (cosine floor)
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
