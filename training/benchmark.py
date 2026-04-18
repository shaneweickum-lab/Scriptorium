"""Quick throughput benchmark for MavenSLM on your local hardware.

Run this before starting a full training run to calibrate actual
tokens/sec on your machine and estimate total training time.

Usage:
    python training/benchmark.py                    # auto-detect device
    python training/benchmark.py --device mps       # force MPS (Apple Silicon)
    python training/benchmark.py --device cpu       # CPU only
    python training/benchmark.py --steps 200        # longer warmup
"""

import argparse
import time

import torch

import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).parent))

from maven_slm import MavenSLM, MavenSLMConfig

WARMUP_STEPS  = 10
MEASURE_STEPS = 100
BATCH_SIZE    = 2
SEQ_LEN       = 512   # shorter than max for benchmark; realistic training length


def pick_device(requested: str | None) -> torch.device:
    if requested:
        return torch.device(requested)
    if torch.cuda.is_available():
        return torch.device("cuda")
    if torch.backends.mps.is_available():
        return torch.device("mps")
    return torch.device("cpu")


def run(device: torch.device, steps: int = MEASURE_STEPS) -> None:
    print(f"\nMavenSLM Throughput Benchmark")
    print(f"{'=' * 40}")
    print(f"Device     : {device}")

    config = MavenSLMConfig()
    model  = MavenSLM(config).to(device)
    model.train()

    counts = model.param_count()
    print(f"Parameters : {counts['unique_params']:,}  (~{counts['unique_params']/1e6:.1f} M)")
    print(f"Batch size : {BATCH_SIZE} × {SEQ_LEN} tokens")
    print()

    optimizer = torch.optim.AdamW(model.parameters(), lr=3e-4)

    dtype = torch.bfloat16 if device.type in ("cuda", "mps") else torch.float32
    use_amp = dtype != torch.float32

    def step() -> float:
        input_ids = torch.randint(
            0, config.vocab_size, (BATCH_SIZE, SEQ_LEN), device=device
        )
        targets = torch.randint(
            0, config.vocab_size, (BATCH_SIZE, SEQ_LEN), device=device
        )
        with torch.autocast(device_type=device.type, dtype=dtype, enabled=use_amp):
            _, loss = model(input_ids, targets)
        loss.backward()
        optimizer.step()
        optimizer.zero_grad()
        return loss.item()

    # Warmup
    print(f"Warming up ({WARMUP_STEPS} steps)…", end=" ", flush=True)
    for _ in range(WARMUP_STEPS):
        step()
    if device.type == "mps":
        torch.mps.synchronize()
    elif device.type == "cuda":
        torch.cuda.synchronize()
    print("done")

    # Measure
    print(f"Measuring  ({steps} steps)…", end=" ", flush=True)
    t0 = time.perf_counter()
    for _ in range(steps):
        step()
    if device.type == "mps":
        torch.mps.synchronize()
    elif device.type == "cuda":
        torch.cuda.synchronize()
    elapsed = time.perf_counter() - t0
    print("done")

    tokens_per_step = BATCH_SIZE * SEQ_LEN
    total_tokens    = tokens_per_step * steps
    tok_per_sec     = total_tokens / elapsed

    print()
    print(f"Results")
    print(f"{'─' * 40}")
    print(f"Elapsed      : {elapsed:.2f}s  ({elapsed/steps*1000:.1f} ms/step)")
    print(f"Throughput   : {tok_per_sec:,.0f} tokens/sec")
    print()

    # Training time estimates
    for corpus_tokens in [500_000_000, 1_000_000_000, 5_000_000_000]:
        secs = corpus_tokens / tok_per_sec
        hrs  = secs / 3600
        label = f"{corpus_tokens/1e9:.1f}B tokens"
        if hrs < 1:
            print(f"  {label:15s} → {secs/60:.0f} minutes")
        elif hrs < 24:
            print(f"  {label:15s} → {hrs:.1f} hours")
        else:
            print(f"  {label:15s} → {hrs/24:.1f} days")

    print()
    print("Recommendation: use 1B tokens for pre-training on this hardware.")


def main() -> None:
    parser = argparse.ArgumentParser(description="MavenSLM throughput benchmark")
    parser.add_argument("--device", default=None, help="Device: cpu / mps / cuda")
    parser.add_argument("--steps", type=int, default=MEASURE_STEPS)
    args = parser.parse_args()

    device = pick_device(args.device)
    run(device, steps=args.steps)


if __name__ == "__main__":
    main()
