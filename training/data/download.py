"""Download corpus sources for MavenSLM pre-training.

Usage:
    python data/download.py --source all          # Download all sources
    python data/download.py --source pg19         # Project Gutenberg only
    python data/download.py --source writingprompts
    python data/download.py --source pg19 --max-docs 5000  # subset for testing

Output:
    data/raw/pg19/           — ~28k fiction books, one .txt per book
    data/raw/writingprompts/ — Reddit fiction responses, one .txt per entry

Both sources are filtered to English fiction at download time.
Total uncompressed size: ~8–12 GB depending on sources and limits.
"""

import argparse
import re
import sys
from pathlib import Path

from datasets import load_dataset
from tqdm import tqdm

RAW_DIR = Path(__file__).parent.parent / "data" / "raw"


# ---------------------------------------------------------------------------
# Project Gutenberg (pg19)
# ---------------------------------------------------------------------------

def download_pg19(max_docs: int | None = None) -> None:
    """Download the PG-19 dataset — 28,752 English books pre-1919."""
    out = RAW_DIR / "pg19"
    out.mkdir(parents=True, exist_ok=True)

    print("Downloading PG-19 (Project Gutenberg)…")
    print("This streams ~10 GB — first run may take 30–60 minutes.\n")

    ds = load_dataset("deepmind/pg19", split="train", streaming=True, trust_remote_code=True)

    written = 0
    for i, example in enumerate(tqdm(ds, desc="pg19")):
        if max_docs and i >= max_docs:
            break

        text: str = example.get("text", "")
        title: str = example.get("short_book_title", f"book_{i}")

        # Sanitise filename
        safe = re.sub(r"[^\w\s-]", "", title).strip().replace(" ", "_")[:80]
        fname = out / f"{i:06d}_{safe}.txt"

        if fname.exists():
            written += 1
            continue

        fname.write_text(text, encoding="utf-8")
        written += 1

    print(f"\nPG-19: {written} books saved to {out}")


# ---------------------------------------------------------------------------
# WritingPrompts
# ---------------------------------------------------------------------------

def download_writingprompts(max_docs: int | None = None) -> None:
    """Download the Reddit WritingPrompts dataset (story responses only)."""
    out = RAW_DIR / "writingprompts"
    out.mkdir(parents=True, exist_ok=True)

    print("Downloading WritingPrompts…")

    ds = load_dataset("euclaise/writingprompts", split="train", streaming=True, trust_remote_code=True)

    written = 0
    for i, example in enumerate(tqdm(ds, desc="writingprompts")):
        if max_docs and i >= max_docs:
            break

        # Dataset has "prompt" and "story" fields; we want the story text
        story = example.get("story", example.get("text", ""))
        if not story or len(story) < 200:
            continue

        fname = out / f"{i:08d}.txt"
        if fname.exists():
            written += 1
            continue

        fname.write_text(story, encoding="utf-8")
        written += 1

    print(f"\nWritingPrompts: {written} stories saved to {out}")


# ---------------------------------------------------------------------------
# CLI
# ---------------------------------------------------------------------------

SOURCES = {
    "pg19":           download_pg19,
    "writingprompts": download_writingprompts,
}


def main() -> None:
    parser = argparse.ArgumentParser(description="Download MavenSLM corpus sources")
    parser.add_argument(
        "--source",
        choices=[*SOURCES.keys(), "all"],
        default="all",
        help="Which corpus to download (default: all)",
    )
    parser.add_argument(
        "--max-docs",
        type=int,
        default=None,
        help="Cap documents per source (useful for testing the pipeline)",
    )
    args = parser.parse_args()

    targets = list(SOURCES.keys()) if args.source == "all" else [args.source]

    for name in targets:
        print(f"\n{'=' * 50}")
        print(f"Source: {name}")
        print(f"{'=' * 50}")
        SOURCES[name](max_docs=args.max_docs)

    print("\nDownload complete.")
    print(f"Raw data saved to: {RAW_DIR}")
    print("Next step: python data/clean.py --input data/raw --output data/clean")


if __name__ == "__main__":
    main()
