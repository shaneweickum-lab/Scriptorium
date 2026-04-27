"""Training hyperparameters for MeyvnSLM pre-training.

Defaults are tuned for Apple M5 Pro (24 GB unified RAM), 1.5B token corpus,
targeting Chinchilla-optimal compute for the 75 M parameter model.

Effective batch size = micro_batch_size × grad_accum_steps × block_size
                     = 2 × 128 × 2048 = 524,288 tokens per gradient update.
Steps for 1.5B tokens ≈ 1.5B / 524,288 ≈ 2,861 → max_steps = 3,000.

──────────────────────────────────────────────────────────────────────────────
BitLinear 1.58-bit learning rate notes
──────────────────────────────────────────────────────────────────────────────
Ternary QAT introduces two instability modes that standard LR schedules
do not anticipate:

  1. Threshold ping-pong: If the LR is too large, shadow weights near the
     ternary threshold (|w/γ| ≈ 0.5) oscillate between −1 and +1 every
     step. The gradient noise from adjacent tokens is enough to flip them.
     Fix: lower max_lr for BitLinear params (see MeyvnSLM.make_optimizer_groups).

  2. Zero collapse: If γ (AbsMean) shrinks early in training, the threshold
     for a non-zero ternary rises, and most weights round to 0. The model
     then behaves like a sparse random projection and loss stalls.
     Fix: extended warmup (≥10% of total steps) + weight_decay ≥ 0.1 to
     prevent γ from collapsing via L2 regularisation pulling weights to 0.

Recommended settings for full BitLinear pre-training:
  • max_lr = 1e-4  (half the standard 2e-4; scales with param budget)
  • bitlinear_lr_scale = 0.5 in make_optimizer_groups
  • warmup_steps = 300 (10% of 3,000-step run)
  • weight_decay = 0.1
  • grad_clip = 1.0

Monitor model.ternary_health_check() every 500 steps:
  • Healthy zero_pct: 25–55%
  • If zero_pct > 60% for >3 consecutive checkpoints: reduce LR by 2×
  • If zero_pct < 15%: increase weight_decay to 0.15
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
    micro_batch_size: int  = 2      # sequences per forward pass (MPS tuned)
    grad_accum_steps: int  = 128    # accumulate before optimizer step
    # effective_batch_tokens = 2 × 128 × 2048 = 524,288 ≈ 0.5 M

    # ------------------------------------------------------------------
    # Training duration  (Chinchilla-optimal: 1.5B tokens for 75M params)
    # ------------------------------------------------------------------
    max_steps: int    = 3_000   # 3,000 × 524,288 ≈ 1.57 B tokens
    warmup_steps: int = 300     # 10% warmup — critical for ternary stability

    # ------------------------------------------------------------------
    # Optimiser (AdamW)
    # ------------------------------------------------------------------
    # Use 1e-4 for BitLinear runs; 3e-4 for standard fp precision runs.
    # BitLinear shadow weights receive an additional 0.5× scale via
    # MeyvnSLM.make_optimizer_groups — effective LR on ternary layers ≈ 5e-5.
    max_lr: float       = 1e-4
    min_lr: float       = 1e-5     # 10% of max_lr (cosine floor)
    weight_decay: float = 0.1
    beta1: float        = 0.9
    beta2: float        = 0.95
    grad_clip: float    = 1.0

    # BitLinear differential LR scale (applied in make_optimizer_groups).
    # Shadow weights receive max_lr × bitlinear_lr_scale as their base LR.
    bitlinear_lr_scale: float = 0.5

    # ------------------------------------------------------------------
    # Logging and checkpointing
    # ------------------------------------------------------------------
    log_interval: int            = 1
    val_interval: int            = 250    # evaluate val loss every N steps
    val_steps: int               = 50     # val batches per evaluation
    sample_interval: int         = 500    # generate a text sample every N steps
    checkpoint_interval: int     = 500
    checkpoint_dir: str          = "checkpoints"
    keep_last_n_checkpoints: int = 3

    # Log ternary health (zero%, gamma, w_std) for BitLinear runs
    ternary_health_interval: int = 500

    # ------------------------------------------------------------------
    # Weights & Biases (optional — set use_wandb=True to enable)
    # ------------------------------------------------------------------
    use_wandb: bool     = False
    wandb_project: str  = "meyvn-slm"
    wandb_run_name: str = ""   # auto-generated if empty

    # ------------------------------------------------------------------
    # Misc
    # ------------------------------------------------------------------
    seed: int     = 42
    device: str   = ""      # auto-detect: mps > cuda > cpu
    # torch.compile is unstable on MPS — leave False unless using CUDA
    compile: bool = False

    def effective_batch_tokens(self) -> int:
        return self.micro_batch_size * self.grad_accum_steps * self.block_size

    def estimated_total_tokens(self) -> int:
        return self.max_steps * self.effective_batch_tokens()

    def __post_init__(self) -> None:
        assert self.warmup_steps < self.max_steps
        assert self.min_lr <= self.max_lr
        assert self.micro_batch_size >= 1
        assert self.grad_accum_steps >= 1
