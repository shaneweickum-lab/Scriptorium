"""Tokenize cleaned corpus into binary shards for MavenSLM training.

Format:
  Each shard is a flat numpy uint16 array saved as a raw .bin file.
  Token IDs are packed contiguously — no padding, no chunk boundaries.
  During training, the DataLoader picks random offsets and slices
  (input[i : i+2048], target[i+1 : i+2049]) for each example.

  Documents are formatted as:  <|bos|> {text} <|eos|>
  and concatenated end-to-end. This is the nanoGPT-style approach:
  maximally efficient, zero wasted compute on padding.

Splits: 98% train / 1% val / 1% test

Usage:
    # Requires trained tokenizer from Phase 1
    python data/tokenize_corpus.py \\
        --tokenizer tokenizer/maven-tokenizer \\
        --input     data/clean \\
        --output    data/tokenized \\
        --shard-size 100000000   # 100M tokens per shard (~200 MB)

Output:
    data/tokenized/
    ├── train/
    │   ├── shard_000000.bin
    │   ├── shard_000001.bin
    │   └── …
    ├── val/
    │   └── shard_000000.bin
    ├── test/
    │   └── shard_000000.bin
    └── meta.json    — vocab size, total tokens, shard list
"""

import argparse
import json
import random
import sys
from pathlib import Path

import numpy as np
from tqdm import tqdm
from transformers import PreTrainedTokenizerFast

SHARD_SIZE_DEFAULT = 100_000_000   # tokens per shard
TRAIN_FRAC = 0.98
VAL_FRAC   = 0.01
# test = remainder


# ---------------------------------------------------------------------------
# Shard writer
# ---------------------------------------------------------------------------

class ShardWriter:
    """Accumulates token IDs and flushes to .bin files at shard_size."""

    def __init__(self, output_dir: Path, split: str, shard_size: int) -> None:
        self.dir        = output_dir / split
        self.dir.mkdir(parents=True, exist_ok=True)
        self.shard_size = shard_size
        self.buffer:  list[int] = []
        self.shard_idx = 0
        self.total_tokens = 0

    def write(self, token_ids: list[int]) -> None:
        self.buffer.extend(token_ids)
        while len(self.buffer) >= self.shard_size:
            self._flush(self.buffer[: self.shard_size])
            self.buffer = self.buffer[self.shard_size :]

    def _flush(self, tokens: list[int]) -> None:
        path = self.dir / f"shard_{self.shard_idx:06d}.bin"
        arr = np.array(tokens, dtype=np.uint16)
        arr.tofile(path)
        self.total_tokens += len(tokens)
        self.shard_idx += 1

    def close(self) -> int:
        """Flush remaining tokens. Returns total tokens written."""
        if self.buffer:
            self._flush(self.buffer)
            self.buffer = []
        return self.total_tokens + (len(self.buffer))  # already flushed above


# ---------------------------------------------------------------------------
# Tokenisation helpers
# ---------------------------------------------------------------------------

def tokenize_document(
    text: str,
    tokenizer: PreTrainedTokenizerFast,
    bos_id: int,
    eos_id: int,
) -> list[int]:
    """Encode one document: BOS + token IDs + EOS."""
    ids = tokenizer.encode(text, add_special_tokens=False)
    return [bos_id] + ids + [eos_id]


def tokenize_and_shard(
    input_dir: Path,
    output_dir: Path,
    tokenizer: PreTrainedTokenizerFast,
    shard_size: int = SHARD_SIZE_DEFAULT,
    seed: int = 42,
) -> dict:
    """Main pipeline: tokenize all documents, write split shards."""
    bos_id = tokenizer.bos_token_id
    eos_id = tokenizer.eos_token_id

    all_files = sorted(input_dir.rglob("*.txt"))
    if not all_files:
        raise FileNotFoundError(f"No .txt files found in {input_dir}")

    # Shuffle for random train/val/test split
    rng = random.Random(seed)
    rng.shuffle(all_files)

    n = len(all_files)
    train_end = int(n * TRAIN_FRAC)
    val_end   = train_end + int(n * VAL_FRAC)

    splits = {
        "train": all_files[:train_end],
        "val":   all_files[train_end:val_end],
        "test":  all_files[val_end:],
    }

    output_dir.mkdir(parents=True, exist_ok=True)
    totals: dict[str, int] = {}

    for split_name, files in splits.items():
        if not files:
            print(f"Warning: no files assigned to {split_name} split")
            totals[split_name] = 0
            continue

        writer = ShardWriter(output_dir, split_name, shard_size)
        for path in tqdm(files, desc=f"Tokenising {split_name}"):
            try:
                text = path.read_text(encoding="utf-8", errors="replace")
            except OSError:
                continue
            ids = tokenize_document(text, tokenizer, bos_id, eos_id)
            writer.write(ids)

        total = writer.close()
        totals[split_name] = total
        print(f"  {split_name}: {total:,} tokens across {writer.shard_idx} shard(s)")

    # Write metadata
    meta = {
        "vocab_size":    tokenizer.vocab_size,
        "bos_token_id": bos_id,
        "eos_token_id": eos_id,
        "shard_size":   shard_size,
        "token_counts": totals,
        "total_tokens": sum(totals.values()),
        "splits": {
            split: [str(p) for p in sorted((output_dir / split).glob("*.bin"))]
            for split in splits
        },
    }
    (output_dir / "meta.json").write_text(
        json.dumps(meta, indent=2), encoding="utf-8"
    )
    return meta


# ---------------------------------------------------------------------------
# DataLoader helper (used in Phase 3 train.py)
# ---------------------------------------------------------------------------

class BinaryShardDataset:
    """Memory-mapped dataset over a directory of .bin shard files.

    Each call to __getitem__ returns a random (input, target) pair of
    length block_size from the concatenated token stream.
    """

    def __init__(self, shard_dir: Path, block_size: int = 2048) -> None:
        self.block_size = block_size
        shard_files = sorted(shard_dir.glob("*.bin"))
        if not shard_files:
            raise FileNotFoundError(f"No .bin shards found in {shard_dir}")

        # Memory-map all shards and concatenate their lengths
        self.mmaps: list[np.ndarray] = [
            np.memmap(f, dtype=np.uint16, mode="r") for f in shard_files
        ]
        self.lengths = [len(m) for m in self.mmaps]
        self.total   = sum(self.lengths)

        # Cumulative offsets for index lookup
        self.cum: list[int] = []
        acc = 0
        for l in self.lengths:
            self.cum.append(acc)
            acc += l

    def __len__(self) -> int:
        return self.total - self.block_size

    def __getitem__(self, idx: int):
        import torch

        # Find which shard and local offset
        shard_i = 0
        for i, start in enumerate(self.cum):
            if i + 1 < len(self.cum) and idx >= self.cum[i + 1]:
                continue
            shard_i = i
            break

        local_idx = idx - self.cum[shard_i]
        mmap = self.mmaps[shard_i]

        # If the window spans two shards, fall back to shard boundary
        if local_idx + self.block_size + 1 > len(mmap):
            local_idx = max(0, len(mmap) - self.block_size - 1)

        chunk = mmap[local_idx : local_idx + self.block_size + 1].astype(np.int64)
        x = torch.from_numpy(chunk[:-1])
        y = torch.from_numpy(chunk[1:])
        return x, y


# ---------------------------------------------------------------------------
# CLI
# ---------------------------------------------------------------------------

def main() -> None:
    parser = argparse.ArgumentParser(description="Tokenize corpus into binary shards")
    parser.add_argument("--tokenizer", required=True, help="Path to trained HuggingFace tokenizer")
    parser.add_argument("--input",     required=True, help="Cleaned corpus directory")
    parser.add_argument("--output",    required=True, help="Output directory for shards")
    parser.add_argument("--shard-size", type=int, default=SHARD_SIZE_DEFAULT,
                        help=f"Tokens per shard (default: {SHARD_SIZE_DEFAULT:,})")
    parser.add_argument("--seed", type=int, default=42)
    args = parser.parse_args()

    tokenizer_path = Path(args.tokenizer)
    if not tokenizer_path.exists():
        print(
            f"Error: tokenizer not found at {tokenizer_path}\n"
            "Run Phase 1 tokenizer training first:\n"
            "  python tokenizer/train_tokenizer.py --corpus data/raw/**/*.txt "
            "--output tokenizer/maven-tokenizer",
            file=sys.stderr,
        )
        sys.exit(1)

    tokenizer = PreTrainedTokenizerFast.from_pretrained(str(tokenizer_path))
    meta = tokenize_and_shard(
        Path(args.input), Path(args.output), tokenizer,
        shard_size=args.shard_size, seed=args.seed,
    )

    print(f"\nTokenisation complete.")
    print(f"  Total tokens : {meta['total_tokens']:,}")
    for split, count in meta["token_counts"].items():
        print(f"  {split:6s}       : {count:,}")
    print(f"\nNext step: python data/validate_shards.py --data {args.output}")


if __name__ == "__main__":
    main()
