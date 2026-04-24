"""Training hyperparameters for MavenSLM pre-training.

Defaults are tuned for Apple M5 Pro (24 GB unified RAM) with 1B token corpus.
Effective batch size = micro_batch_size × grad_accum_steps × block_size
                    = 4 × 32 × 2048 = 262,144 tokens per gradient update.
Steps for 1B tokens ≈ 1B / 262,144 ≈ 3,815 → max_steps = 4,000.
"""

from dataclasses import dataclass, field


@dataclass
class TrainConfig:
    # ------------------------------------------------------------------
    # Data
    # ------------------------------------------------------------------
    data_dir: str      = "data/tokenized"
    tokenizer_dir: str = "tokenizer/maven-tokenizer"

    # ------------------------------------------------------------------
    # Sequence / batch
    # ------------------------------------------------------------------
    block_size: int        = 1024   # tokens per sample = model max_seq_len
    micro_batch_size: int  = 4      # sequences per forward pass
    grad_accum_steps: int  = 8     # accumulate before optimizer step
    # effective_batch_tokens = micro_batch_size × grad_accum_steps × block_size
    #                        = 4 × 32 × 2048 = 262,144

    # ------------------------------------------------------------------
    # Training duration
    # ------------------------------------------------------------------
    max_steps: int      = 4_000    # ≈ 1.05 B tokens at 262k tokens/update
    warmup_steps: int   = 200      # linear warmup (5 % of max_steps)

    # ------------------------------------------------------------------
    # Optimiser (AdamW)
    # ------------------------------------------------------------------
    max_lr: float       = 3e-4
    min_lr: float       = 3e-5     # 10 % of max_lr (cosine floor)
    weight_decay: float = 0.1
    beta1: float        = 0.9
    beta2: float        = 0.95
    grad_clip: float    = 1.0

    # ------------------------------------------------------------------
    # Logging and checkpointing
    # ------------------------------------------------------------------
    log_interval: int               = 1
    val_interval: int               = 250    # evaluate val loss every N steps
    val_steps: int                  = 50     # val batches per evaluation
    sample_interval: int            = 50    # generate a text sample every N steps
    checkpoint_interval: int        = 500
    checkpoint_dir: str             = "checkpoints"
    keep_last_n_checkpoints: int    = 3

    # ------------------------------------------------------------------
    # Weights & Biases (optional — set use_wandb=True to enable)
    # ------------------------------------------------------------------
    use_wandb: bool    = False
    wandb_project: str = "maven-slm"
    wandb_run_name: str = ""   # auto-generated if empty

    # ------------------------------------------------------------------
    # Misc
    # ------------------------------------------------------------------
    seed: int       = 42
    device: str     = ""      # auto-detect: mps > cuda > cpu
    # torch.compile is unstable on MPS — leave False unless using CUDA
    compile: bool   = False

    def effective_batch_tokens(self) -> int:
        return self.micro_batch_size * self.grad_accum_steps * self.block_size

    def estimated_total_tokens(self) -> int:
        return self.max_steps * self.effective_batch_tokens()

    def __post_init__(self) -> None:
        assert self.warmup_steps < self.max_steps
        assert self.min_lr <= self.max_lr
        assert self.micro_batch_size >= 1
        assert self.grad_accum_steps >= 1
