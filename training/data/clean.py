"""Quality filtering and cleaning for MavenSLM corpus.

Pipeline (applied per document):
  1. Strip Project Gutenberg boilerplate headers/footers
  2. Normalise whitespace (collapse runs, fix line endings)
  3. Minimum word count (150 words ≈ 200 tokens)
  4. English language check (word-list heuristic, no external dependency)
  5. Printable character ratio (rejects OCR garbage)
  6. Repetition filter (rejects documents with repeated paragraphs)
  7. Optional MinHash near-deduplication (requires datasketch)

Usage:
    python data/clean.py \\
        --input  data/raw \\
        --output data/clean \\
        --dedupe          # enable MinHash deduplication (slower)

    python data/clean.py --input data/raw/pg19 --output data/clean/pg19
"""

import argparse
import re
import unicodedata
from pathlib import Path
from typing import Iterator

from tqdm import tqdm

# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------

MIN_WORDS = 150
MIN_PRINTABLE_RATIO = 0.92

# Common English function words — presence signals English prose
_ENGLISH_WORDS = frozenset(
    "the a an and or but in on at to of for with is are was were be been "
    "have has had do does did will would could should may might shall not "
    "he she it they we you I me him her us them his her its their our your "
    "this that these those what which who how when where why all some any "
    "said went came looked knew thought felt could would".split()
)
_ENGLISH_THRESHOLD = 0.04   # ≥4% of words must be common English words

# Project Gutenberg header/footer markers
_PG_START_RE = re.compile(
    r"\*\*\*\s*START\s+OF\s+(THE|THIS)\s+PROJECT\s+GUTENBERG",
    re.IGNORECASE,
)
_PG_END_RE = re.compile(
    r"\*\*\*\s*END\s+OF\s+(THE|THIS)\s+PROJECT\s+GUTENBERG",
    re.IGNORECASE,
)

# Repeated line detection
_BLANK_LINE_RE = re.compile(r"\n{3,}")
_WHITESPACE_RE = re.compile(r"[ \t]+")


# ---------------------------------------------------------------------------
# Cleaning functions
# ---------------------------------------------------------------------------

def remove_gutenberg_boilerplate(text: str) -> str:
    """Strip everything before START marker and after END marker."""
    start_match = _PG_START_RE.search(text)
    if start_match:
        # Skip to end of the start-marker line
        text = text[start_match.end():]
        # Skip the next blank line separator
        text = text.lstrip("\r\n")

    end_match = _PG_END_RE.search(text)
    if end_match:
        text = text[: end_match.start()]

    return text.strip()


def normalise_whitespace(text: str) -> str:
    """Collapse tabs/trailing spaces; cap consecutive blank lines at 2."""
    lines = []
    for line in text.splitlines():
        lines.append(_WHITESPACE_RE.sub(" ", line).rstrip())
    text = "\n".join(lines)
    text = _BLANK_LINE_RE.sub("\n\n", text)
    return text.strip()


def clean_document(text: str) -> str:
    """Apply all cleaning transforms and return cleaned text."""
    text = remove_gutenberg_boilerplate(text)
    # NFC Unicode normalisation (preserves em-dash, ellipsis, curly quotes)
    text = unicodedata.normalize("NFC", text)
    text = normalise_whitespace(text)
    return text


# ---------------------------------------------------------------------------
# Filter functions — return True if document PASSES the filter
# ---------------------------------------------------------------------------

def _word_count(text: str) -> int:
    return len(text.split())


def filter_min_length(text: str, min_words: int = MIN_WORDS) -> bool:
    return _word_count(text) >= min_words


def filter_english(text: str) -> bool:
    """Heuristic: enough common English words present."""
    words = text.lower().split()
    if not words:
        return False
    hits = sum(1 for w in words if w.strip(".,!?;:\"'—…-") in _ENGLISH_WORDS)
    return (hits / len(words)) >= _ENGLISH_THRESHOLD


def filter_printable_ratio(text: str) -> bool:
    """Reject OCR garbage: require high ratio of printable characters."""
    if not text:
        return False
    printable = sum(
        1 for c in text
        if unicodedata.category(c)[0] in ("L", "N", "P", "Z", "S")
    )
    return (printable / len(text)) >= MIN_PRINTABLE_RATIO


def filter_repetition(text: str, max_dup_ratio: float = 0.25) -> bool:
    """Reject documents where the same paragraph appears repeatedly."""
    paragraphs = [p.strip() for p in text.split("\n\n") if p.strip()]
    if len(paragraphs) < 4:
        return True  # too short to judge
    unique = len(set(paragraphs))
    dup_ratio = 1.0 - (unique / len(paragraphs))
    return dup_ratio <= max_dup_ratio


def filter_document(text: str) -> bool:
    """Return True if the document passes all quality filters."""
    return (
        filter_min_length(text)
        and filter_english(text)
        and filter_printable_ratio(text)
        and filter_repetition(text)
    )


# ---------------------------------------------------------------------------
# Near-deduplication with MinHash LSH (optional)
# ---------------------------------------------------------------------------

def _build_deduper(threshold: float = 0.85, num_perm: int = 128):
    """Return (MinHash class, MinHashLSH index) or None if datasketch missing."""
    try:
        from datasketch import MinHash, MinHashLSH
        lsh = MinHashLSH(threshold=threshold, num_perm=num_perm)
        return MinHash, lsh
    except ImportError:
        print(
            "datasketch not installed — skipping near-deduplication.\n"
            "Install with: pip install datasketch"
        )
        return None, None


def _minhash(text: str, MinHash, num_perm: int = 128):
    m = MinHash(num_perm=num_perm)
    for word in text.lower().split():
        m.update(word.encode("utf-8"))
    return m


# ---------------------------------------------------------------------------
# Pipeline
# ---------------------------------------------------------------------------

def iter_raw_files(input_dir: Path) -> Iterator[Path]:
    for ext in ("*.txt", "*.text"):
        yield from sorted(input_dir.rglob(ext))


def process_directory(
    input_dir: Path,
    output_dir: Path,
    dedupe: bool = False,
) -> dict:
    output_dir.mkdir(parents=True, exist_ok=True)

    MinHashCls, lsh = _build_deduper() if dedupe else (None, None)
    use_dedupe = dedupe and MinHashCls is not None

    stats = {"total": 0, "passed": 0, "failed_length": 0,
             "failed_english": 0, "failed_printable": 0,
             "failed_repetition": 0, "deduped": 0}

    files = list(iter_raw_files(input_dir))
    for path in tqdm(files, desc="Cleaning"):
        stats["total"] += 1
        try:
            raw = path.read_text(encoding="utf-8", errors="replace")
        except OSError:
            continue

        text = clean_document(raw)

        if not filter_min_length(text):
            stats["failed_length"] += 1
            continue
        if not filter_english(text):
            stats["failed_english"] += 1
            continue
        if not filter_printable_ratio(text):
            stats["failed_printable"] += 1
            continue
        if not filter_repetition(text):
            stats["failed_repetition"] += 1
            continue

        if use_dedupe:
            mh = _minhash(text, MinHashCls)
            key = path.stem
            if lsh.query(mh):
                stats["deduped"] += 1
                continue
            lsh.insert(key, mh)

        out_path = output_dir / path.relative_to(input_dir).with_suffix(".txt")
        out_path.parent.mkdir(parents=True, exist_ok=True)
        out_path.write_text(text, encoding="utf-8")
        stats["passed"] += 1

    return stats


# ---------------------------------------------------------------------------
# CLI
# ---------------------------------------------------------------------------

def main() -> None:
    parser = argparse.ArgumentParser(description="Clean MavenSLM corpus")
    parser.add_argument("--input",  required=True, help="Raw data directory")
    parser.add_argument("--output", required=True, help="Output directory for cleaned data")
    parser.add_argument("--dedupe", action="store_true", help="Enable MinHash near-deduplication")
    args = parser.parse_args()

    stats = process_directory(Path(args.input), Path(args.output), dedupe=args.dedupe)

    print("\nCleaning complete.")
    print(f"  Total files     : {stats['total']}")
    print(f"  Passed          : {stats['passed']}  ({100*stats['passed']/max(stats['total'],1):.1f}%)")
    print(f"  Failed length   : {stats['failed_length']}")
    print(f"  Failed English  : {stats['failed_english']}")
    print(f"  Failed printable: {stats['failed_printable']}")
    print(f"  Failed repetition:{stats['failed_repetition']}")
    if args.dedupe:
        print(f"  Near-duplicates : {stats['deduped']}")
    print(f"\nNext step: python data/tokenize_corpus.py --input {args.output} --output data/tokenized")


if __name__ == "__main__":
    main()
