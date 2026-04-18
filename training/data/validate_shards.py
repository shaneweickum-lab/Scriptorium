"""Sanity-check the tokenized shard files before training.

Checks:
  1. meta.json is present and well-formed
  2. All shard files listed in meta.json exist and are non-empty
  3. Token IDs are within vocab range [0, vocab_size)
  4. Total token count matches meta.json
  5. Decodes 3 random chunks and prints them for human inspection

Usage:
    python data/validate_shards.py --data data/tokenized
    python data/validate_shards.py --data data/tokenized --tokenizer tokenizer/maven-tokenizer
"""

import argparse
import json
import random
import sys
from pathlib import Path

import numpy as np


def load_meta(data_dir: Path) -> dict:
    meta_path = data_dir / "meta.json"
    if not meta_path.exists():
        print(f"Error: meta.json not found in {data_dir}", file=sys.stderr)
        sys.exit(1)
    return json.loads(meta_path.read_text())


def check_shards(data_dir: Path, meta: dict) -> bool:
    vocab_size = meta["vocab_size"]
    ok = True

    for split, shard_paths in meta["splits"].items():
        if not shard_paths:
            print(f"  Warning: {split} split has no shards")
            continue

        split_tokens = 0
        for path_str in shard_paths:
            path = Path(path_str)
            if not path.exists():
                print(f"  MISSING shard: {path}")
                ok = False
                continue

            arr = np.memmap(path, dtype=np.uint16, mode="r")
            if len(arr) == 0:
                print(f"  EMPTY shard: {path}")
                ok = False
                continue

            # Check token ID bounds
            max_id = int(arr.max())
            if max_id >= vocab_size:
                print(f"  OUT-OF-RANGE token {max_id} >= vocab_size {vocab_size} in {path}")
                ok = False

            split_tokens += len(arr)

        recorded = meta["token_counts"].get(split, 0)
        if split_tokens != recorded:
            print(
                f"  Token count mismatch for {split}: "
                f"counted {split_tokens:,} vs meta.json {recorded:,}"
            )
            ok = False
        else:
            print(f"  {split:6s}: {split_tokens:,} tokens  ✓")

    return ok


def decode_samples(data_dir: Path, meta: dict, tokenizer, n: int = 3) -> None:
    """Decode n random chunks from the train split and print them."""
    train_shards = meta["splits"].get("train", [])
    if not train_shards:
        return

    rng = random.Random(0)
    chosen_shard = rng.choice(train_shards)
    arr = np.memmap(chosen_shard, dtype=np.uint16, mode="r")
    block = 256   # decode 256 tokens per sample

    print(f"\n{'─' * 60}")
    print(f"Sample decoded chunks from: {Path(chosen_shard).name}")
    print(f"{'─' * 60}")

    for i in range(n):
        start = rng.randint(0, max(0, len(arr) - block - 1))
        tokens = arr[start : start + block].astype(np.int64).tolist()
        text = tokenizer.decode(tokens, skip_special_tokens=False)
        print(f"\n[Sample {i+1}  offset={start:,}]")
        print(text[:400])
        print("…")


def main() -> None:
    parser = argparse.ArgumentParser(description="Validate MavenSLM tokenized shards")
    parser.add_argument("--data", required=True, help="Tokenized data directory (contains meta.json)")
    parser.add_argument("--tokenizer", default=None, help="Tokenizer path for decoding samples")
    parser.add_argument("--no-decode", action="store_true", help="Skip sample decoding")
    args = parser.parse_args()

    data_dir = Path(args.data)
    meta = load_meta(data_dir)

    print(f"Validating shards in: {data_dir}")
    print(f"Vocab size      : {meta['vocab_size']:,}")
    print(f"Total tokens    : {meta['total_tokens']:,}  (~{meta['total_tokens']/1e9:.2f} B)")
    print(f"Shard size      : {meta['shard_size']:,}")
    print()

    ok = check_shards(data_dir, meta)

    if not ok:
        print("\nValidation FAILED — fix errors above before training.", file=sys.stderr)
        sys.exit(1)

    print(f"\nTotal: {meta['total_tokens']:,} tokens  ({meta['total_tokens']/1e9:.2f} B)")

    if not args.no_decode and args.tokenizer:
        from transformers import PreTrainedTokenizerFast
        tok = PreTrainedTokenizerFast.from_pretrained(args.tokenizer)
        decode_samples(data_dir, meta, tok)
    elif not args.no_decode:
        print("\nTip: pass --tokenizer tokenizer/maven-tokenizer to preview decoded samples")

    print("\nValidation passed. Ready for Phase 3 training.")
    print("Next step: python train.py --data data/tokenized --tokenizer tokenizer/maven-tokenizer")


if __name__ == "__main__":
    main()
