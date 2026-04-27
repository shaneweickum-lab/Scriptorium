"""MeyvnSLM pre-training script.

Trains the ~75 M parameter decoder-only transformer on the tokenized binary
shards produced by data/tokenize_corpus.py.

Key features:
  - MPS (Apple Silicon), CUDA, or CPU — auto-detected
  - bfloat16 mixed-precision via torch.autocast
  - Cosine LR schedule with linear warmup
  - Gradient accumulation over micro-batches
  - Gradient clipping
  - Resumable training (save/load full checkpoint)
  - Periodic validation loss + text sample generation
  - Optional Weights & Biases logging
  - Graceful SIGINT/SIGTERM: saves checkpoint before exiting

Usage:
    python train.py                              # all defaults (M5 tuned)
    python train.py --max-steps 4000             # override step count
    python train.py --resume checkpoints/step_001500.pt
    python train.py --use-wandb                  # enable W&B logging
    python train.py --device cpu                 # force CPU (slow)

Expected output line:
    Step   250 | loss 3.841 | lr 2.98e-04 | gnorm 0.94 | 8.2k tok/s | eta 21h04m
"""

import argparse
import math
import random
import signal
import sys
import time
from datetime import timedelta
from pathlib import Path

import numpy as np
import torch
import torch.nn as nn
from transformers import PreTrainedTokenizerFast

sys.path.insert(0, str(Path(__file__).parent))
from meyvn_slm import MeyvnSLM, MeyvnSLMConfig
from train_config import TrainConfig


# ---------------------------------------------------------------------------
# Device selection
# ---------------------------------------------------------------------------

def pick_device(requested: str) -> torch.device:
    if requested:
        return torch.device(requested)
    if torch.backends.mps.is_available():
        return torch.device("mps")
    if torch.cuda.is_available():
        return torch.device("cuda")
    return torch.device("cpu")


def pick_dtype(device: torch.device) -> torch.dtype:
    if device.type == "cpu":
        return torch.float32
    # bfloat16 is preferred (no overflow) — available on M2+ and Ampere+
    try:
        t = torch.zeros(1, dtype=torch.bfloat16, device=device)
        del t
        return torch.bfloat16
    except (RuntimeError, AssertionError):
        return torch.float16


# ---------------------------------------------------------------------------
# Learning rate schedule
# ---------------------------------------------------------------------------

def get_lr(step: int, cfg: TrainConfig) -> float:
    """Cosine decay with linear warmup."""
    if step < cfg.warmup_steps:
        return cfg.max_lr * (step + 1) / cfg.warmup_steps
    if step >= cfg.max_steps:
        return cfg.min_lr
    progress = (step - cfg.warmup_steps) / (cfg.max_steps - cfg.warmup_steps)
    cosine = 0.5 * (1.0 + math.cos(math.pi * progress))
    return cfg.min_lr + cosine * (cfg.max_lr - cfg.min_lr)


# ---------------------------------------------------------------------------
# Data loading — memory-mapped shards, random access
# ---------------------------------------------------------------------------

class ShardLoader:
    """Random-access loader over a directory of uint16 .bin shard files."""

    def __init__(
        self,
        shard_dir: Path,
        batch_size: int,
        block_size: int,
        device: torch.device,
    ) -> None:
        files = sorted(shard_dir.glob("*.bin"))
        if not files:
            raise FileNotFoundError(f"No .bin shards in {shard_dir}")

        self.mmaps = [np.memmap(f, dtype=np.uint16, mode="r") for f in files]
        sizes      = np.array([len(m) - block_size - 1 for m in self.mmaps], dtype=np.float64)
        # Shards with fewer tokens than block_size+1 can't yield a sample
        valid      = sizes > 0
        self.mmaps = [m for m, v in zip(self.mmaps, valid) if v]
        sizes      = sizes[valid]
        self.weights   = sizes / sizes.sum()
        self.batch_size = batch_size
        self.block_size = block_size
        self.device     = device
        self.total_tokens = int(sum(len(m) for m in self.mmaps))

    def next_batch(self) -> tuple[torch.Tensor, torch.Tensor]:
        shard_idxs = np.random.choice(len(self.mmaps), size=self.batch_size, p=self.weights)
        xs, ys = [], []
        for si in shard_idxs:
            shard     = self.mmaps[si]
            max_start = len(shard) - self.block_size - 1
            i = random.randint(0, max_start)
            x = torch.from_numpy(shard[i     : i + self.block_size    ].astype(np.int64))
            y = torch.from_numpy(shard[i + 1 : i + self.block_size + 1].astype(np.int64))
            xs.append(x)
            ys.append(y)
        return (
            torch.stack(xs).to(self.device),
            torch.stack(ys).to(self.device),
        )


# ---------------------------------------------------------------------------
# Checkpointing
# ---------------------------------------------------------------------------

def save_checkpoint(
    path: Path,
    model: MeyvnSLM,
    optimizer: torch.optim.Optimizer,
    step: int,
    val_loss: float,
    model_config: MeyvnSLMConfig,
    train_config: TrainConfig,
) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    torch.save(
        {
            "step":             step,
            "model_state":      model.state_dict(),
            "optimizer_state":  optimizer.state_dict(),
            "val_loss":         val_loss,
            "model_config":     model_config.__dict__,
            "train_config":     train_config.__dict__,
        },
        path,
    )


def load_checkpoint(
    path: Path,
    model: MeyvnSLM,
    optimizer: torch.optim.Optimizer,
) -> tuple[int, float]:
    ckpt = torch.load(path, map_location="cpu", weights_only=False)
    model.load_state_dict(ckpt["model_state"])
    optimizer.load_state_dict(ckpt["optimizer_state"])
    return ckpt["step"], ckpt.get("val_loss", float("inf"))


def prune_checkpoints(ckpt_dir: Path, keep: int) -> None:
    ckpts = sorted(ckpt_dir.glob("step_*.pt"))
    for old in ckpts[:-keep]:
        old.unlink(missing_ok=True)


# ---------------------------------------------------------------------------
# Validation
# ---------------------------------------------------------------------------

@torch.no_grad()
def evaluate_val_loss(
    model: MeyvnSLM,
    val_loader: ShardLoader,
    val_steps: int,
    autocast_ctx,
) -> float:
    model.eval()
    total = 0.0
    for _ in range(val_steps):
        x, y = val_loader.next_batch()
        with autocast_ctx:
            _, loss = model(x, y)
        total += loss.item()
    model.train()
    return total / val_steps


# ---------------------------------------------------------------------------
# Text sample generation
# ---------------------------------------------------------------------------

@torch.no_grad()
def generate_sample(
    model: MeyvnSLM,
    tokenizer: PreTrainedTokenizerFast,
    device: torch.device,
    prompt: str = "<|bos|>",
    max_new_tokens: int = 120,
) -> str:
    model.eval()
    ids = tokenizer.encode(prompt, add_special_tokens=False)
    x   = torch.tensor([ids], dtype=torch.long, device=device)
    out = model.generate(x, max_new_tokens=max_new_tokens, temperature=0.8, top_k=50, top_p=0.9)
    model.train()
    return tokenizer.decode(out[0].tolist(), skip_special_tokens=False)


# ---------------------------------------------------------------------------
# Training loop
# ---------------------------------------------------------------------------

def train(cfg: TrainConfig) -> None:
    device = pick_device(cfg.device)
    dtype  = pick_dtype(device)
    use_amp = dtype != torch.float32
    autocast_ctx = torch.autocast(device_type=device.type, dtype=dtype, enabled=use_amp)

    print(f"\nMeyvnSLM Pre-Training")
    print(f"{'=' * 50}")
    print(f"Device          : {device}  (dtype={dtype})")
    print(f"Effective batch : {cfg.effective_batch_tokens():,} tokens/update")
    print(f"Target tokens   : {cfg.estimated_total_tokens()/1e9:.2f} B")
    print(f"Max steps       : {cfg.max_steps:,}")
    print(f"Warmup steps    : {cfg.warmup_steps}")
    print()

    # Reproducibility
    torch.manual_seed(cfg.seed)
    random.seed(cfg.seed)
    np.random.seed(cfg.seed)

    # ------------------------------------------------------------------
    # Model
    # ------------------------------------------------------------------
    model_config = MeyvnSLMConfig()
    model = MeyvnSLM(model_config).to(device)
    if cfg.compile and device.type == "cuda":
        print("Compiling model with torch.compile…")
        model = torch.compile(model)

    counts = model.param_count()
    print(f"Parameters      : {counts['unique_params']:,}  (~{counts['unique_params']/1e6:.1f} M)")

    # ------------------------------------------------------------------
    # Tokenizer (for sample generation)
    # ------------------------------------------------------------------
    tokenizer_path = Path(cfg.tokenizer_dir)
    tokenizer = (
        PreTrainedTokenizerFast.from_pretrained(str(tokenizer_path))
        if tokenizer_path.exists()
        else None
    )

    # ------------------------------------------------------------------
    # Data loaders
    # ------------------------------------------------------------------
    data_dir  = Path(cfg.data_dir)
    train_loader = ShardLoader(data_dir / "train", cfg.micro_batch_size, cfg.block_size, device)
    val_loader   = ShardLoader(data_dir / "val",   cfg.micro_batch_size, cfg.block_size, device)
    print(f"Train tokens    : {train_loader.total_tokens:,}")
    print(f"Val tokens      : {val_loader.total_tokens:,}")
    print()

    # ------------------------------------------------------------------
    # Optimiser
    # ------------------------------------------------------------------
    # For BitLinear runs, use differential LR: shadow weights get 0.5× LR
    # to prevent threshold ping-pong near ternary boundaries (see train_config.py).
    if model_config.use_bitlinear:
        param_groups = model.make_optimizer_groups(
            base_lr=cfg.max_lr,
            weight_decay=cfg.weight_decay,
            bitlinear_lr_scale=cfg.bitlinear_lr_scale,
        )
    else:
        decay_params    = [p for n, p in model.named_parameters() if p.dim() >= 2]
        no_decay_params = [p for n, p in model.named_parameters() if p.dim() < 2]
        param_groups    = [
            {"params": decay_params,    "weight_decay": cfg.weight_decay},
            {"params": no_decay_params, "weight_decay": 0.0},
        ]
    optimizer = torch.optim.AdamW(
        param_groups,
        lr=cfg.max_lr,
        betas=(cfg.beta1, cfg.beta2),
        fused=False,   # fused AdamW is CUDA-only
    )

    # ------------------------------------------------------------------
    # Optional WandB
    # ------------------------------------------------------------------
    wandb_run = None
    if cfg.use_wandb:
        try:
            import wandb
            run_name = cfg.wandb_run_name or f"meyvn-slm-{time.strftime('%Y%m%d-%H%M%S')}"
            wandb_run = wandb.init(
                project=cfg.wandb_project,
                name=run_name,
                config={**model_config.__dict__, **cfg.__dict__},
            )
            print(f"WandB run: {wandb_run.url}")
        except ImportError:
            print("wandb not installed — skipping W&B logging.")

    # ------------------------------------------------------------------
    # Resume from checkpoint
    # ------------------------------------------------------------------
    start_step = 0
    best_val_loss = float("inf")

    ckpt_dir = Path(cfg.checkpoint_dir)
    if cfg.resume:
        resume_path = Path(cfg.resume)
        if resume_path.exists():
            start_step, best_val_loss = load_checkpoint(resume_path, model, optimizer)
            model.to(device)
            print(f"Resumed from {resume_path}  (step={start_step}, val_loss={best_val_loss:.4f})")
        else:
            print(f"Warning: checkpoint {resume_path} not found — starting fresh.")

    # ------------------------------------------------------------------
    # Graceful shutdown handler
    # ------------------------------------------------------------------
    _stop = {"flag": False}
    def _handle_signal(sig, frame):
        print("\nInterrupt received — will save checkpoint after this step.")
        _stop["flag"] = True
    signal.signal(signal.SIGINT,  _handle_signal)
    signal.signal(signal.SIGTERM, _handle_signal)

    # ------------------------------------------------------------------
    # Training loop
    # ------------------------------------------------------------------
    model.train()
    step           = start_step
    t0             = time.perf_counter()
    tok_per_sec_ema = 0.0  # exponential moving average for throughput display

    print(f"{'Step':>7}  {'loss':>7}  {'lr':>10}  {'gnorm':>6}  {'tok/s':>8}  {'eta':>10}")
    print("─" * 62)

    while step < cfg.max_steps:
        step_t0  = time.perf_counter()
        lr       = get_lr(step, cfg)
        for param_group in optimizer.param_groups:
            param_group["lr"] = lr

        # Gradient accumulation
        optimizer.zero_grad(set_to_none=True)
        loss_accum = 0.0
        for _ in range(cfg.grad_accum_steps):
            x, y = train_loader.next_batch()
            with autocast_ctx:
                _, loss = model(x, y)
            (loss / cfg.grad_accum_steps).backward()
            loss_accum += loss.item() / cfg.grad_accum_steps

        # Gradient clipping
        grad_norm = nn.utils.clip_grad_norm_(model.parameters(), cfg.grad_clip).item()
        optimizer.step()

        # Sync device timers
        if device.type == "mps":
            torch.mps.synchronize()
        elif device.type == "cuda":
            torch.cuda.synchronize()

        step_dt    = time.perf_counter() - step_t0
        step_tokens = cfg.micro_batch_size * cfg.grad_accum_steps * cfg.block_size
        cur_tps    = step_tokens / step_dt
        tok_per_sec_ema = 0.9 * tok_per_sec_ema + 0.1 * cur_tps if tok_per_sec_ema else cur_tps

        step += 1

        # ------ Logging ------
        if step % cfg.log_interval == 0:
            steps_left   = cfg.max_steps - step
            eta_secs     = steps_left * step_dt
            eta_str      = str(timedelta(seconds=int(eta_secs)))
            tps_str      = f"{tok_per_sec_ema/1000:.1f}k"
            print(
                f"{step:7d}  {loss_accum:7.4f}  {lr:10.3e}  "
                f"{grad_norm:6.3f}  {tps_str:>8}  {eta_str:>10}"
            )

            if wandb_run:
                wandb_run.log({
                    "train/loss":      loss_accum,
                    "train/lr":        lr,
                    "train/grad_norm": grad_norm,
                    "perf/tok_per_sec": tok_per_sec_ema,
                    "step":            step,
                })

        # ------ Validation ------
        if step % cfg.val_interval == 0:
            val_loss = evaluate_val_loss(model, val_loader, cfg.val_steps, autocast_ctx)
            elapsed  = str(timedelta(seconds=int(time.perf_counter() - t0)))
            print(f"\n{'─'*62}")
            print(f"  Step {step} | val_loss={val_loss:.4f} | elapsed={elapsed}")
            if val_loss < best_val_loss:
                best_val_loss = val_loss
                save_checkpoint(
                    ckpt_dir / "best.pt",
                    model, optimizer, step, val_loss, model_config, cfg,
                )
                print(f"  New best checkpoint saved  (val_loss={val_loss:.4f})")
            print(f"{'─'*62}\n")

            if wandb_run:
                wandb_run.log({"val/loss": val_loss, "step": step})

        # ------ Ternary health check (BitLinear only) ------
        if (model_config.use_bitlinear
                and step % cfg.ternary_health_interval == 0):
            health = model.ternary_health_check()
            avg_zero = sum(s["zero_pct"] for s in health.values()) / max(len(health), 1)
            avg_std  = sum(s["w_std"]    for s in health.values()) / max(len(health), 1)
            print(f"  [ternary] avg_zero={avg_zero:.1f}%  avg_w_std={avg_std:.4f}")
            if wandb_run:
                wandb_run.log({"ternary/avg_zero_pct": avg_zero,
                               "ternary/avg_w_std": avg_std, "step": step})

        # ------ Text sample ------
        if step % cfg.sample_interval == 0 and tokenizer:
            sample = generate_sample(model, tokenizer, device)
            print(f"\n[Sample @ step {step}]\n{sample[:400]}\n")

        # ------ Checkpoint ------
        if step % cfg.checkpoint_interval == 0:
            ckpt_path = ckpt_dir / f"step_{step:07d}.pt"
            save_checkpoint(ckpt_path, model, optimizer, step, best_val_loss, model_config, cfg)
            prune_checkpoints(ckpt_dir, cfg.keep_last_n_checkpoints)
            print(f"  Checkpoint saved: {ckpt_path.name}")

        if _stop["flag"]:
            break

    # ------------------------------------------------------------------
    # Final checkpoint
    # ------------------------------------------------------------------
    final_path = ckpt_dir / f"step_{step:07d}_final.pt"
    save_checkpoint(final_path, model, optimizer, step, best_val_loss, model_config, cfg)
    elapsed = str(timedelta(seconds=int(time.perf_counter() - t0)))
    print(f"\nTraining complete — {step} steps in {elapsed}")
    print(f"Final checkpoint : {final_path}")
    print(f"Best val loss    : {best_val_loss:.4f}")
    print(f"\nNext step: python eval.py --checkpoint {final_path}")

    if wandb_run:
        wandb_run.finish()


# ---------------------------------------------------------------------------
# CLI
# ---------------------------------------------------------------------------

def main() -> None:
    parser = argparse.ArgumentParser(description="Train MeyvnSLM")

    # Override any TrainConfig field from the command line
    parser.add_argument("--data-dir",             default=TrainConfig.data_dir)
    parser.add_argument("--tokenizer-dir",        default=TrainConfig.tokenizer_dir)
    parser.add_argument("--block-size",           type=int,   default=TrainConfig.block_size)
    parser.add_argument("--micro-batch-size",     type=int,   default=TrainConfig.micro_batch_size)
    parser.add_argument("--grad-accum-steps",     type=int,   default=TrainConfig.grad_accum_steps)
    parser.add_argument("--max-steps",            type=int,   default=TrainConfig.max_steps)
    parser.add_argument("--warmup-steps",         type=int,   default=TrainConfig.warmup_steps)
    parser.add_argument("--max-lr",               type=float, default=TrainConfig.max_lr)
    parser.add_argument("--min-lr",               type=float, default=TrainConfig.min_lr)
    parser.add_argument("--weight-decay",         type=float, default=TrainConfig.weight_decay)
    parser.add_argument("--grad-clip",            type=float, default=TrainConfig.grad_clip)
    parser.add_argument("--log-interval",         type=int,   default=TrainConfig.log_interval)
    parser.add_argument("--val-interval",         type=int,   default=TrainConfig.val_interval)
    parser.add_argument("--checkpoint-interval",  type=int,   default=TrainConfig.checkpoint_interval)
    parser.add_argument("--checkpoint-dir",       default=TrainConfig.checkpoint_dir)
    parser.add_argument("--seed",                 type=int,   default=TrainConfig.seed)
    parser.add_argument("--device",               default=TrainConfig.device)
    parser.add_argument("--compile",              action="store_true")
    parser.add_argument("--use-wandb",            action="store_true")
    parser.add_argument("--wandb-project",        default=TrainConfig.wandb_project)
    parser.add_argument("--wandb-run-name",       default=TrainConfig.wandb_run_name)
    parser.add_argument("--resume",               default=None, help="Path to checkpoint to resume from")

    args = parser.parse_args()

    cfg = TrainConfig(
        data_dir            = args.data_dir,
        tokenizer_dir       = args.tokenizer_dir,
        block_size          = args.block_size,
        micro_batch_size    = args.micro_batch_size,
        grad_accum_steps    = args.grad_accum_steps,
        max_steps           = args.max_steps,
        warmup_steps        = args.warmup_steps,
        max_lr              = args.max_lr,
        min_lr              = args.min_lr,
        weight_decay        = args.weight_decay,
        grad_clip           = args.grad_clip,
        log_interval        = args.log_interval,
        val_interval        = args.val_interval,
        checkpoint_interval = args.checkpoint_interval,
        checkpoint_dir      = args.checkpoint_dir,
        seed                = args.seed,
        device              = args.device,
        compile             = args.compile,
        use_wandb           = args.use_wandb,
        wandb_project       = args.wandb_project,
        wandb_run_name      = args.wandb_run_name,
    )
    cfg.resume = args.resume   # not a dataclass field — attach dynamically

    train(cfg)


if __name__ == "__main__":
    main()
