"""SFT dataset: tokenizes instruction pairs with response-only loss masking.

Each example is a full instruction+response sequence, but labels for the
instruction portion (everything up to and including <|/inst|>) are set to
IGNORE_INDEX (-100) so cross-entropy loss is computed only over response tokens.

Template structure (all five task types end the instruction with <|/inst|>):

    <|inst|> ... <|/inst|>
    {response tokens here}   ← only these contribute to loss
"""

import json
import random
from pathlib import Path

import torch
import torch.nn.functional as F
from torch.utils.data import Dataset
from transformers import PreTrainedTokenizerFast

IGNORE_INDEX = -100


class SFTDataset(Dataset):
    """Memory-resident SFT dataset built from a JSONL file of instruction pairs.

    Args:
        jsonl_path:    Path to instruction_pairs.jsonl
        tokenizer:     Loaded HuggingFace tokenizer (must have <|bos|>, <|eos|>, <|/inst|>)
        block_size:    Maximum sequence length (sequences truncated or padded to this)
        inst_close_id: Token ID for <|/inst|> — labels up to here are masked
        indices:       Optional list of line indices to use (for train/val splits)
    """

    def __init__(
        self,
        jsonl_path: Path,
        tokenizer: PreTrainedTokenizerFast,
        block_size: int,
        inst_close_id: int,
        indices: list[int] | None = None,
    ) -> None:
        self.block_size    = block_size
        self.inst_close_id = inst_close_id

        bos_id = tokenizer.convert_tokens_to_ids("<|bos|>")
        eos_id = tokenizer.convert_tokens_to_ids("<|eos|>")

        raw: list[dict] = []
        with open(jsonl_path, encoding="utf-8") as f:
            for line in f:
                line = line.strip()
                if line:
                    raw.append(json.loads(line))

        if indices is not None:
            raw = [raw[i] for i in indices]

        self.examples: list[tuple[torch.Tensor, torch.Tensor]] = []

        for item in raw:
            ids = tokenizer.encode(item["text"], add_special_tokens=False)
            ids = [bos_id] + ids + [eos_id]
            # Need at least 2 tokens to form an (x, y) pair
            ids = ids[: block_size + 1]
            if len(ids) < 2:
                continue

            x = torch.tensor(ids[:-1], dtype=torch.long)
            y = torch.tensor(ids[1:],  dtype=torch.long)

            y = _mask_instruction(x, y, inst_close_id)

            # Skip examples where every label is masked (no learning signal)
            if (y != IGNORE_INDEX).sum() == 0:
                continue

            # Pad short sequences to block_size
            pad_len = block_size - len(x)
            if pad_len > 0:
                x = F.pad(x, (0, pad_len), value=0)
                y = F.pad(y, (0, pad_len), value=IGNORE_INDEX)

            self.examples.append((x, y))

    def __len__(self) -> int:
        return len(self.examples)

    def __getitem__(self, idx: int) -> tuple[torch.Tensor, torch.Tensor]:
        return self.examples[idx]


def _mask_instruction(
    x: torch.Tensor,
    y: torch.Tensor,
    inst_close_id: int,
) -> torch.Tensor:
    """Return y with IGNORE_INDEX for all positions up to and including <|/inst|>.

    The model input x contains the instruction; we want loss only on the
    response tokens that follow <|/inst|> in x.
    """
    y = y.clone()
    positions = (x == inst_close_id).nonzero(as_tuple=True)[0]
    if len(positions) == 0:
        # No <|/inst|> token found — mask entire sequence (no learning signal)
        y[:] = IGNORE_INDEX
        return y
    # Mask up to and including the first <|/inst|> occurrence in x
    cutoff = int(positions[0].item()) + 1
    y[:cutoff] = IGNORE_INDEX
    return y


def make_train_val_split(
    jsonl_path: Path,
    val_split: float,
    seed: int = 42,
) -> tuple[list[int], list[int]]:
    """Return (train_indices, val_indices) for a random split of the JSONL file."""
    with open(jsonl_path, encoding="utf-8") as f:
        n = sum(1 for line in f if line.strip())

    indices = list(range(n))
    rng = random.Random(seed)
    rng.shuffle(indices)
    n_val = max(1, int(n * val_split))
    return indices[n_val:], indices[:n_val]
