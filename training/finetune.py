"""MavenSLM Supervised Fine-Tuning (SFT).

Loads a pre-trained MavenSLM checkpoint and fine-tunes it on instruction pairs
produced by data/generate_instruction_pairs.py. Loss is computed only on
response tokens — the instruction portion is masked via IGNORE_INDEX (-100).

Key differences from pre-training:
  - Lower LR (3e-5 vs 3e-4)
  - Epoch-based cycling over the instruction-pair dataset
  - DataLoader with shuffle (dataset fits in RAM)
  - NaN-safe accumulation (some masked examples produce NaN loss)

Usage:
    # First run (from pre-training checkpoint):
    python finetune.py --pretrain-checkpoint checkpoints/final_step_4000.pt

    # Resume an interrupted SFT run:
    python finetune.py \\
        --pretrain-checkpoint checkpoints/final_step_4000.pt \\
        --resume checkpoints/sft/step_0000600.pt

    # More steps:
    python finetune.py \\
        --pretrain-checkpoint checkpoints/final_step_4000.pt \\
        --max-steps 2000

Expected output line:
    Step   100 | loss 2.341 | lr 2.98e-05 | gnorm 0.71 | 3.1k tok/s | eta 02h14m
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
from torch.utils.data import DataLoader
from transformers import PreTrainedTokenizerFast

sys.path.insert(0, str(Path(__file__).parent))
from maven_slm import MavenSLM, MavenSLMConfig
from finetune_config import FinetuneConfig
from data.sft_dataset import SFTDataset, make_train_val_split
from train import pick_device, pick_dtype, generate_sample


# ---------------------------------------------------------------------------
# LR schedule — same cosine shape, lower range
# ---------------------------------------------------------------------------

def get_sft_lr(step: int, cfg: FinetuneConfig) -> float:
    if step < cfg.warmup_steps:
        return cfg.max_lr * (step + 1) / cfg.warmup_steps
    if step >= cfg.max_steps:
        return cfg.min_lr
    progress = (step - cfg.warmup_steps) / (cfg.max_steps - cfg.warmup_steps)
    cosine = 0.5 * (1.0 + math.cos(math.pi * progress))
    return cfg.min_lr + cosine * (cfg.max_lr - cfg.min_lr)


# ---------------------------------------------------------------------------
# Checkpointing
# ---------------------------------------------------------------------------

def save_sft_checkpoint(
    path: Path,
    model: MavenSLM,
    optimizer: torch.optim.Optimizer,
    step: int,
    val_loss: float,
    model_config: MavenSLMConfig,
    sft_config: FinetuneConfig,
) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    torch.save(
        {
            "phase":           "sft",
            "step":            step,
            "model_state":     model.state_dict(),
            "optimizer_state": optimizer.state_dict(),
            "val_loss":        val_loss,
            "model_config":    model_config.__dict__,
            "sft_config":      sft_config.__dict__,
        },
        path,
    )


def load_pretrain_weights(path: Path, model: MavenSLM) -> None:
    """Copy only model weights from a pre-training checkpoint — discards optimizer."""
    ckpt = torch.load(path, map_location="cpu", weights_only=False)
    model.load_state_dict(ckpt["model_state"])


def load_sft_checkpoint(
    path: Path,
    model: MavenSLM,
    optimizer: torch.optim.Optimizer,
) -> tuple[int, float]:
    ckpt = torch.load(path, map_location="cpu", weights_only=False)
    model.load_state_dict(ckpt["model_state"])
    optimizer.load_state_dict(ckpt["optimizer_state"])
    return ckpt["step"], ckpt.get("val_loss", float("inf"))


def prune_sft_checkpoints(ckpt_dir: Path, keep: int) -> None:
    ckpts = sorted(ckpt_dir.glob("step_*.pt"))
    for old in ckpts[:-keep]:
        old.unlink(missing_ok=True)


# ---------------------------------------------------------------------------
# Validation
# ---------------------------------------------------------------------------

@torch.no_grad()
def evaluate_sft_val_loss(
    model: MavenSLM,
    val_loader: DataLoader,
    val_steps: int,
    autocast_ctx,
    device: torch.device,
) -> float:
    model.eval()
    total = 0.0
    count = 0
    for x, y in val_loader:
        if count >= val_steps:
            break
        x, y = x.to(device), y.to(device)
        with autocast_ctx:
            _, loss = model(x, y)
        if not torch.isnan(loss):
            total += loss.item()
            count += 1
    model.train()
    return total / max(count, 1)


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

def finetune(cfg: FinetuneConfig) -> None:
    device   = pick_device(cfg.device)
    dtype    = pick_dtype(device)
    use_amp  = dtype != torch.float32
    autocast_ctx = torch.autocast(device_type=device.type, dtype=dtype, enabled=use_amp)

    print(f"\nMavenSLM Supervised Fine-Tuning")
    print(f"{'=' * 50}")
    print(f"Device          : {device}  (dtype={dtype})")
    print(f"Max LR          : {cfg.max_lr}")
    print(f"Max steps       : {cfg.max_steps:,}")
    print(f"Effective batch : {cfg.micro_batch_size * cfg.grad_accum_steps * cfg.block_size:,} tokens/update")
    print()

    torch.manual_seed(cfg.seed)
    random.seed(cfg.seed)
    np.random.seed(cfg.seed)

    # ------------------------------------------------------------------
    # Tokenizer
    # ------------------------------------------------------------------
    tokenizer_path = Path(cfg.tokenizer_dir)
    if not tokenizer_path.exists():
        print(f"Error: tokenizer not found at {tokenizer_path}", file=sys.stderr)
        sys.exit(1)
    tokenizer     = PreTrainedTokenizerFast.from_pretrained(str(tokenizer_path))
    inst_close_id = tokenizer.convert_tokens_to_ids("<|/inst|>")

    # ------------------------------------------------------------------
    # Model
    # ------------------------------------------------------------------
    model_config = MavenSLMConfig()
    model        = MavenSLM(model_config).to(device)
    counts       = model.param_count()
    print(f"Parameters      : {counts['unique_params']:,}  (~{counts['unique_params']/1e6:.1f} M)")

    # ------------------------------------------------------------------
    # Optimiser
    # ------------------------------------------------------------------
    decay_params    = [p for n, p in model.named_parameters() if p.dim() >= 2]
    no_decay_params = [p for n, p in model.named_parameters() if p.dim() < 2]
    optimizer = torch.optim.AdamW(
        [
            {"params": decay_params,    "weight_decay": cfg.weight_decay},
            {"params": no_decay_params, "weight_decay": 0.0},
        ],
        lr=cfg.max_lr,
        betas=(cfg.beta1, cfg.beta2),
        fused=False,
    )

    # ------------------------------------------------------------------
    # Dataset
    # ------------------------------------------------------------------
    jsonl_path = Path(cfg.data_dir) / cfg.jsonl_file
    if not jsonl_path.exists():
        print(
            f"Error: instruction pairs not found at {jsonl_path}\n"
            f"Run: python data/generate_instruction_pairs.py "
            f"--corpus data/clean --output data/instruction_pairs --mode corpus",
            file=sys.stderr,
        )
        sys.exit(1)

    print(f"Loading SFT dataset from {jsonl_path}…")
    train_idx, val_idx = make_train_val_split(jsonl_path, cfg.val_split, cfg.seed)
    train_dataset = SFTDataset(jsonl_path, tokenizer, cfg.block_size, inst_close_id, train_idx)
    val_dataset   = SFTDataset(jsonl_path, tokenizer, cfg.block_size, inst_close_id, val_idx)
    print(f"Train examples  : {len(train_dataset):,}")
    print(f"Val examples    : {len(val_dataset):,}")
    print()

    if len(train_dataset) == 0:
        print(
            "Error: no training examples after filtering.\n"
            "Check that instruction pairs contain <|/inst|> tokens.",
            file=sys.stderr,
        )
        sys.exit(1)

    train_loader = DataLoader(
        train_dataset,
        batch_size=cfg.micro_batch_size,
        shuffle=True,
        num_workers=0,
        drop_last=True,
    )
    val_loader = DataLoader(
        val_dataset,
        batch_size=cfg.micro_batch_size,
        shuffle=False,
        num_workers=0,
        drop_last=False,
    )

    # ------------------------------------------------------------------
    # Optional WandB
    # ------------------------------------------------------------------
    wandb_run = None
    if cfg.use_wandb:
        try:
            import wandb
            run_name  = cfg.wandb_run_name or f"maven-sft-{time.strftime('%Y%m%d-%H%M%S')}"
            wandb_run = wandb.init(
                project=cfg.wandb_project,
                name=run_name,
                config={**model_config.__dict__, **cfg.__dict__},
            )
            print(f"WandB run: {wandb_run.url}")
        except ImportError:
            print("wandb not installed — skipping W&B logging.")

    # ------------------------------------------------------------------
    # Load weights
    # ------------------------------------------------------------------
    start_step    = 0
    best_val_loss = float("inf")
    ckpt_dir      = Path(cfg.checkpoint_dir)

    if cfg.resume:
        resume_path = Path(cfg.resume)
        if resume_path.exists():
            start_step, best_val_loss = load_sft_checkpoint(resume_path, model, optimizer)
            model.to(device)
            print(f"Resumed SFT from {resume_path}  (step={start_step})")
        else:
            print(f"Warning: SFT checkpoint {resume_path} not found — loading pre-training weights.")
            if cfg.pretrain_checkpoint:
                load_pretrain_weights(Path(cfg.pretrain_checkpoint), model)
                model.to(device)
    elif cfg.pretrain_checkpoint:
        load_pretrain_weights(Path(cfg.pretrain_checkpoint), model)
        model.to(device)
        print(f"Loaded pre-training weights from {cfg.pretrain_checkpoint}")
    else:
        print("Warning: no --pretrain-checkpoint provided. Fine-tuning from random init.")

    # ------------------------------------------------------------------
    # Graceful shutdown
    # ------------------------------------------------------------------
    _stop = {"flag": False}
    def _handle_signal(sig, frame):
        print("\nInterrupt received — saving checkpoint after this step.")
        _stop["flag"] = True
    signal.signal(signal.SIGINT,  _handle_signal)
    signal.signal(signal.SIGTERM, _handle_signal)

    # ------------------------------------------------------------------
    # Training loop — cycles over dataset indefinitely
    # ------------------------------------------------------------------
    model.train()
    step            = start_step
    t0              = time.perf_counter()
    tok_per_sec_ema = 0.0
    train_iter      = iter(train_loader)

    def next_batch() -> tuple[torch.Tensor, torch.Tensor]:
        nonlocal train_iter
        try:
            x, y = next(train_iter)
        except StopIteration:
            train_iter = iter(train_loader)
            x, y = next(train_iter)
        return x.to(device), y.to(device)

    print(f"{'Step':>7}  {'loss':>7}  {'lr':>10}  {'gnorm':>6}  {'tok/s':>8}  {'eta':>10}")
    print("─" * 62)

    while step < cfg.max_steps:
        step_t0 = time.perf_counter()
        lr = get_sft_lr(step, cfg)
        for pg in optimizer.param_groups:
            pg["lr"] = lr

        optimizer.zero_grad(set_to_none=True)
        loss_accum   = 0.0
        valid_micros = 0

        for _ in range(cfg.grad_accum_steps):
            x, y = next_batch()
            with autocast_ctx:
                _, loss = model(x, y)
            if torch.isnan(loss):
                continue
            (loss / cfg.grad_accum_steps).backward()
            loss_accum   += loss.item() / cfg.grad_accum_steps
            valid_micros += 1

        if valid_micros == 0:
            step += 1
            continue

        grad_norm = nn.utils.clip_grad_norm_(model.parameters(), cfg.grad_clip).item()
        optimizer.step()

        if device.type == "mps":
            torch.mps.synchronize()
        elif device.type == "cuda":
            torch.cuda.synchronize()

        step_dt = time.perf_counter() - step_t0
        step_tokens = cfg.micro_batch_size * cfg.grad_accum_steps * cfg.block_size
        cur_tps = step_tokens / step_dt
        tok_per_sec_ema = 0.9 * tok_per_sec_ema + 0.1 * cur_tps if tok_per_sec_ema else cur_tps

        step += 1

        # Logging
        if step % cfg.log_interval == 0:
            steps_left = cfg.max_steps - step
            eta_str    = str(timedelta(seconds=int(steps_left * step_dt)))
            tps_str    = f"{tok_per_sec_ema/1000:.1f}k"
            print(
                f"{step:7d}  {loss_accum:7.4f}  {lr:10.3e}  "
                f"{grad_norm:6.3f}  {tps_str:>8}  {eta_str:>10}"
            )
            if wandb_run:
                wandb_run.log({"sft/loss": loss_accum, "sft/lr": lr,
                               "sft/grad_norm": grad_norm, "step": step})

        # Validation
        if step % cfg.val_interval == 0:
            val_loss = evaluate_sft_val_loss(model, val_loader, cfg.val_steps, autocast_ctx, device)
            elapsed  = str(timedelta(seconds=int(time.perf_counter() - t0)))
            print(f"\n{'─'*62}")
            print(f"  Step {step} | val_loss={val_loss:.4f} | elapsed={elapsed}")
            if val_loss < best_val_loss:
                best_val_loss = val_loss
                save_sft_checkpoint(
                    ckpt_dir / "best.pt",
                    model, optimizer, step, val_loss, model_config, cfg,
                )
                print(f"  New best SFT checkpoint  (val_loss={val_loss:.4f})")
            print(f"{'─'*62}\n")
            if wandb_run:
                wandb_run.log({"sft/val_loss": val_loss, "step": step})

        # Text sample
        if step % cfg.sample_interval == 0:
            prompt = "<|inst|> Continue this scene in a vivid style. <|/inst|>\nThe old lighthouse stood"
            sample = generate_sample(model, tokenizer, device, prompt=prompt)
            print(f"\n[Sample @ step {step}]\n{sample[:400]}\n")

        # Checkpoint
        if step % cfg.checkpoint_interval == 0:
            ckpt_path = ckpt_dir / f"step_{step:07d}.pt"
            save_sft_checkpoint(ckpt_path, model, optimizer, step, best_val_loss, model_config, cfg)
            prune_sft_checkpoints(ckpt_dir, cfg.keep_last_n_checkpoints)
            print(f"  Checkpoint saved: {ckpt_path.name}")

        if _stop["flag"]:
            break

    # ------------------------------------------------------------------
    # Final checkpoint
    # ------------------------------------------------------------------
    final_path = ckpt_dir / f"step_{step:07d}_sft_final.pt"
    save_sft_checkpoint(final_path, model, optimizer, step, best_val_loss, model_config, cfg)
    elapsed = str(timedelta(seconds=int(time.perf_counter() - t0)))
    print(f"\nSFT complete — {step} steps in {elapsed}")
    print(f"Final checkpoint : {final_path}")
    print(f"Best val loss    : {best_val_loss:.4f}")
    print(f"\nNext step: python eval.py --checkpoint {final_path}")

    if wandb_run:
        wandb_run.finish()


# ---------------------------------------------------------------------------
# CLI
# ---------------------------------------------------------------------------

def main() -> None:
    parser = argparse.ArgumentParser(description="Fine-tune MavenSLM on instruction pairs")

    parser.add_argument("--pretrain-checkpoint", default="",
                        help="Pre-training checkpoint to load weights from (required for first run)")
    parser.add_argument("--resume",              default=None,
                        help="Resume SFT from a previous SFT checkpoint")
    parser.add_argument("--data-dir",            default=FinetuneConfig.data_dir)
    parser.add_argument("--jsonl-file",          default=FinetuneConfig.jsonl_file)
    parser.add_argument("--tokenizer-dir",       default=FinetuneConfig.tokenizer_dir)
    parser.add_argument("--block-size",          type=int,   default=FinetuneConfig.block_size)
    parser.add_argument("--micro-batch-size",    type=int,   default=FinetuneConfig.micro_batch_size)
    parser.add_argument("--grad-accum-steps",    type=int,   default=FinetuneConfig.grad_accum_steps)
    parser.add_argument("--max-steps",           type=int,   default=FinetuneConfig.max_steps)
    parser.add_argument("--warmup-steps",        type=int,   default=FinetuneConfig.warmup_steps)
    parser.add_argument("--max-lr",              type=float, default=FinetuneConfig.max_lr)
    parser.add_argument("--min-lr",              type=float, default=FinetuneConfig.min_lr)
    parser.add_argument("--weight-decay",        type=float, default=FinetuneConfig.weight_decay)
    parser.add_argument("--grad-clip",           type=float, default=FinetuneConfig.grad_clip)
    parser.add_argument("--val-split",           type=float, default=FinetuneConfig.val_split)
    parser.add_argument("--log-interval",        type=int,   default=FinetuneConfig.log_interval)
    parser.add_argument("--val-interval",        type=int,   default=FinetuneConfig.val_interval)
    parser.add_argument("--checkpoint-interval", type=int,   default=FinetuneConfig.checkpoint_interval)
    parser.add_argument("--checkpoint-dir",      default=FinetuneConfig.checkpoint_dir)
    parser.add_argument("--seed",                type=int,   default=FinetuneConfig.seed)
    parser.add_argument("--device",              default=FinetuneConfig.device)
    parser.add_argument("--use-wandb",           action="store_true")
    parser.add_argument("--wandb-project",       default=FinetuneConfig.wandb_project)
    parser.add_argument("--wandb-run-name",      default=FinetuneConfig.wandb_run_name)

    args = parser.parse_args()

    cfg = FinetuneConfig(
        data_dir            = args.data_dir,
        jsonl_file          = args.jsonl_file,
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
        val_split           = args.val_split,
        log_interval        = args.log_interval,
        val_interval        = args.val_interval,
        checkpoint_interval = args.checkpoint_interval,
        checkpoint_dir      = args.checkpoint_dir,
        seed                = args.seed,
        device              = args.device,
        use_wandb           = args.use_wandb,
        wandb_project       = args.wandb_project,
        wandb_run_name      = args.wandb_run_name,
    )
    cfg.pretrain_checkpoint = args.pretrain_checkpoint
    cfg.resume              = args.resume

    finetune(cfg)


if __name__ == "__main__":
    main()
