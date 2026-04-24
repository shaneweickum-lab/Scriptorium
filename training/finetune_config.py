"""Hyperparameters for MavenSLM supervised fine-tuning (SFT).

Effective batch = micro_batch_size × grad_accum_steps × block_size
               = 2 × 8 × 1024 = 16,384 tokens per gradient update.

SFT uses a much lower learning rate (3e-5 vs 3e-4 pre-training) to avoid
overwriting the language knowledge learned during pre-training.
"""

from dataclasses import dataclass


@dataclass
class FinetuneConfig:
    # ------------------------------------------------------------------
    # Data
    # ------------------------------------------------------------------
    data_dir: str   = "data/instruction_pairs"
    jsonl_file: str = "instruction_pairs.jsonl"
    tokenizer_dir: str = "tokenizer/maven-tokenizer"

    # ------------------------------------------------------------------
    # Sequence / batch
    # ------------------------------------------------------------------
    block_size: int       = 1024   # SFT examples are shorter than 2048
    micro_batch_size: int = 2
    grad_accum_steps: int = 8      # effective batch = 2 × 8 × 1024 = 16,384 tokens

    # ------------------------------------------------------------------
    # Training duration
    # ------------------------------------------------------------------
    max_steps: int    = 1_000   # ~50k examples / ~16 sequences per update
    warmup_steps: int = 50

    # ------------------------------------------------------------------
    # Optimiser — lighter settings for fine-tuning
    # ------------------------------------------------------------------
    max_lr: float       = 3e-5   # 10× lower than pre-training
    min_lr: float       = 3e-6
    weight_decay: float = 0.01   # lighter regularisation
    beta1: float        = 0.9
    beta2: float        = 0.95
    grad_clip: float    = 1.0

    # ------------------------------------------------------------------
    # Validation split
    # ------------------------------------------------------------------
    val_split: float = 0.05   # 5% of instruction pairs held out for validation

    # ------------------------------------------------------------------
    # Logging and checkpointing
    # ------------------------------------------------------------------
    log_interval: int            = 10
    val_interval: int            = 100
    val_steps: int               = 20
    sample_interval: int         = 200
    checkpoint_interval: int     = 200
    checkpoint_dir: str          = "checkpoints/sft"
    keep_last_n_checkpoints: int = 3

    # ------------------------------------------------------------------
    # Weights & Biases (optional)
    # ------------------------------------------------------------------
    use_wandb: bool     = False
    wandb_project: str  = "maven-slm-sft"
    wandb_run_name: str = ""

    # ------------------------------------------------------------------
    # Misc
    # ------------------------------------------------------------------
    seed: int    = 42
    device: str  = ""   # auto-detect: mps > cuda > cpu

    def __post_init__(self) -> None:
        assert self.warmup_steps < self.max_steps
        assert self.min_lr <= self.max_lr
        assert self.micro_batch_size >= 1
        assert self.grad_accum_steps >= 1
        assert 0.0 < self.val_split < 0.5
