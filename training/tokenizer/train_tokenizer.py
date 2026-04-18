"""Train the MavenSLM BPE tokenizer.

Usage:
    python tokenizer/train_tokenizer.py \\
        --corpus data/raw/*.txt \\
        --output tokenizer/maven-tokenizer \\
        --vocab-size 32768

The tokenizer is trained on your Phase 2 fiction corpus (Project Gutenberg,
WritingPrompts, etc.). Run this after assembling the corpus in Phase 2.

Output is a HuggingFace-compatible PreTrainedTokenizerFast saved to --output,
ready for both training scripts and the Transformers.js browser deployment.
"""

import argparse
import glob
import sys
from pathlib import Path

from tokenizers import Tokenizer
from tokenizers.decoders import ByteLevel as ByteLevelDecoder
from tokenizers.models import BPE
from tokenizers.normalizers import NFC
from tokenizers.pre_tokenizers import ByteLevel
from tokenizers.trainers import BpeTrainer
from transformers import PreTrainedTokenizerFast

# Special tokens used throughout MavenSLM prompting and training.
# Order matters: IDs 0–9 are reserved for these tokens.
SPECIAL_TOKENS = [
    "<|pad|>",       # 0  padding
    "<|bos|>",       # 1  beginning of sequence
    "<|eos|>",       # 2  end of sequence
    "<|unk|>",       # 3  unknown (BPE fallback)
    "<|sep|>",       # 4  separates two passages in a single example
    "<|lore|>",      # 5  marks the start of injected World Bible context
    "<|scene|>",     # 6  marks the start of the active scene
    "<|style|>",     # 7  marks the start of style-profile context
    "<|inst|>",      # 8  start of instruction (fine-tuning format)
    "<|/inst|>",     # 9  end of instruction
]

# Token IDs as constants for use in training/inference code
PAD_ID   = 0
BOS_ID   = 1
EOS_ID   = 2
UNK_ID   = 3
SEP_ID   = 4
LORE_ID  = 5
SCENE_ID = 6
STYLE_ID = 7
INST_ID  = 8
EINST_ID = 9


def train(
    corpus_files: list[str],
    output_dir: str,
    vocab_size: int = 32768,
) -> PreTrainedTokenizerFast:
    output_path = Path(output_dir)
    output_path.mkdir(parents=True, exist_ok=True)

    print(f"Training BPE tokenizer on {len(corpus_files)} file(s)…")
    print(f"Target vocab size : {vocab_size}")
    print(f"Special tokens    : {len(SPECIAL_TOKENS)}")
    print(f"Output directory  : {output_path}")
    print()

    tokenizer = Tokenizer(BPE(unk_token="<|unk|>"))

    # NFC normalisation: normalises Unicode but preserves em-dash (—),
    # ellipsis (…), curly quotes, and other common fiction punctuation.
    tokenizer.normalizer = NFC()

    # Byte-level BPE pre-tokeniser: handles any Unicode safely, preserves
    # whitespace distinctions (leading space = word boundary).
    tokenizer.pre_tokenizer = ByteLevel(add_prefix_space=False)
    tokenizer.decoder = ByteLevelDecoder()

    trainer = BpeTrainer(
        vocab_size=vocab_size,
        special_tokens=SPECIAL_TOKENS,
        min_frequency=2,
        show_progress=True,
        # Preserve common fiction punctuation as atomic tokens where possible
        initial_alphabet=ByteLevel.alphabet(),
    )

    tokenizer.train(files=corpus_files, trainer=trainer)

    fast = PreTrainedTokenizerFast(
        tokenizer_object=tokenizer,
        pad_token="<|pad|>",
        bos_token="<|bos|>",
        eos_token="<|eos|>",
        unk_token="<|unk|>",
        sep_token="<|sep|>",
    )
    fast.add_special_tokens({
        "additional_special_tokens": [
            "<|lore|>", "<|scene|>", "<|style|>", "<|inst|>", "<|/inst|>",
        ]
    })

    fast.save_pretrained(str(output_path))
    print(f"\nTokenizer saved.  Vocabulary size: {fast.vocab_size}")
    return fast


def main() -> None:
    parser = argparse.ArgumentParser(description="Train MavenSLM BPE tokenizer")
    parser.add_argument(
        "--corpus",
        nargs="+",
        required=True,
        help="Glob patterns or file paths for corpus text files",
    )
    parser.add_argument(
        "--output",
        default="tokenizer/maven-tokenizer",
        help="Output directory for tokenizer files",
    )
    parser.add_argument(
        "--vocab-size",
        type=int,
        default=32768,
        help="BPE vocabulary size (default: 32768)",
    )
    args = parser.parse_args()

    # Expand any glob patterns
    files: list[str] = []
    for pattern in args.corpus:
        expanded = glob.glob(pattern, recursive=True)
        if not expanded:
            print(f"Warning: no files matched '{pattern}'", file=sys.stderr)
        files.extend(expanded)

    if not files:
        print("Error: no corpus files found. Run Phase 2 data pipeline first.", file=sys.stderr)
        sys.exit(1)

    train(files, args.output, args.vocab_size)


if __name__ == "__main__":
    main()
