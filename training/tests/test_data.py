"""Tests for Phase 2 data pipeline: cleaning, tokenization, shard I/O.

Run with:  pytest training/tests/test_data.py -v
"""

import json
import sys
import tempfile
from pathlib import Path

import numpy as np
import pytest

sys.path.insert(0, str(Path(__file__).parent.parent))
from data.clean import (
    clean_document,
    filter_document,
    filter_english,
    filter_min_length,
    filter_printable_ratio,
    filter_repetition,
    remove_gutenberg_boilerplate,
    normalise_whitespace,
)

# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------

PG_HEADER = (
    "Project Gutenberg's Pride and Prejudice, by Jane Austen\n\n"
    "This eBook is for the use of anyone anywhere\n\n"
    "*** START OF THE PROJECT GUTENBERG EBOOK PRIDE AND PREJUDICE ***\n\n"
)
PG_FOOTER = (
    "\n\n*** END OF THE PROJECT GUTENBERG EBOOK PRIDE AND PREJUDICE ***\n\n"
    "Updated editions will replace the previous one—the old editions will\n"
    "be renamed.\n"
)
BODY = (
    "It is a truth universally acknowledged, that a single man in possession "
    "of a good fortune, must be in want of a wife. However little known the "
    "feelings or views of such a man may be on his first entering a neighbourhood, "
    "this truth is so well fixed in the minds of the surrounding families, that "
    "he is considered as the rightful property of some one or other of their daughters."
)

# ---------------------------------------------------------------------------
# remove_gutenberg_boilerplate
# ---------------------------------------------------------------------------

def test_strips_pg_header() -> None:
    text = PG_HEADER + BODY
    cleaned = remove_gutenberg_boilerplate(text)
    assert "PROJECT GUTENBERG" not in cleaned.upper()
    assert BODY[:40] in cleaned


def test_strips_pg_footer() -> None:
    text = BODY + PG_FOOTER
    cleaned = remove_gutenberg_boilerplate(text)
    assert "Updated editions" not in cleaned
    assert BODY[:40] in cleaned


def test_strips_header_and_footer() -> None:
    text = PG_HEADER + BODY + PG_FOOTER
    cleaned = remove_gutenberg_boilerplate(text)
    assert "PROJECT GUTENBERG" not in cleaned.upper()
    assert "Updated editions" not in cleaned
    assert BODY[:30] in cleaned


def test_no_markers_unchanged() -> None:
    cleaned = remove_gutenberg_boilerplate(BODY)
    assert BODY.strip() == cleaned.strip()


# ---------------------------------------------------------------------------
# normalise_whitespace
# ---------------------------------------------------------------------------

def test_collapses_trailing_spaces() -> None:
    text = "Hello   world  \n  Goodbye  "
    result = normalise_whitespace(text)
    assert "   " not in result


def test_caps_blank_lines() -> None:
    text = "Para one.\n\n\n\n\nPara two."
    result = normalise_whitespace(text)
    assert "\n\n\n" not in result


# ---------------------------------------------------------------------------
# filter_min_length
# ---------------------------------------------------------------------------

def test_short_text_fails() -> None:
    assert not filter_min_length("Too short.", min_words=150)


def test_long_text_passes() -> None:
    text = "word " * 200
    assert filter_min_length(text, min_words=150)


# ---------------------------------------------------------------------------
# filter_english
# ---------------------------------------------------------------------------

def test_english_passes() -> None:
    assert filter_english(BODY * 3)


def test_non_english_fails() -> None:
    # French text with no common English function words
    text = (
        "Le soleil brillait sur la mer calme et bleue. "
        "Les vagues douces léchaient le sable fin. "
        "Marie regardait au loin avec un sourire mystérieux. "
    ) * 10
    assert not filter_english(text)


# ---------------------------------------------------------------------------
# filter_printable_ratio
# ---------------------------------------------------------------------------

def test_clean_text_passes() -> None:
    assert filter_printable_ratio(BODY)


def test_garbage_text_fails() -> None:
    garbage = "\x00\x01\x02\x03\x04\x05" * 200 + "some words"
    assert not filter_printable_ratio(garbage)


# ---------------------------------------------------------------------------
# filter_repetition
# ---------------------------------------------------------------------------

def test_normal_text_passes() -> None:
    text = "\n\n".join([f"Paragraph number {i}. " + "Words " * 20 for i in range(20)])
    assert filter_repetition(text)


def test_repeated_paragraphs_fails() -> None:
    repeated = ("\n\n" + "The same paragraph repeated. " * 10) * 30
    assert not filter_repetition(repeated)


# ---------------------------------------------------------------------------
# filter_document (integration)
# ---------------------------------------------------------------------------

def test_good_document_passes() -> None:
    doc = (BODY + " ") * 5   # enough words, clean English
    assert filter_document(doc)


def test_short_document_fails() -> None:
    assert not filter_document("Too short.")


# ---------------------------------------------------------------------------
# clean_document (integration)
# ---------------------------------------------------------------------------

def test_clean_document_removes_boilerplate() -> None:
    raw = PG_HEADER + BODY + PG_FOOTER
    cleaned = clean_document(raw)
    assert "PROJECT GUTENBERG" not in cleaned.upper()
    assert BODY[:30] in cleaned


# ---------------------------------------------------------------------------
# Tokenization + sharding
# ---------------------------------------------------------------------------

@pytest.fixture(scope="module")
def tiny_tokenizer():
    """Train a minimal tokenizer in a temp dir for shard tests."""
    import tempfile
    from tokenizer.train_tokenizer import train

    corpus = (
        "The wizard walked through the ancient forest. "
        "She carried a lantern that never went out. "
        "Rain fell softly on the cobblestones below. "
    ) * 300

    with tempfile.TemporaryDirectory() as tmpdir:
        tmp = Path(tmpdir)
        (tmp / "corpus.txt").write_text(corpus)
        tok = train([str(tmp / "corpus.txt")], str(tmp / "tok"), vocab_size=512)
        yield tok


def test_shard_roundtrip(tiny_tokenizer) -> None:
    """Tokenize a small corpus, write shards, load and verify."""
    from data.tokenize_corpus import tokenize_and_shard, BinaryShardDataset

    corpus_text = (
        "The dragon soared above the mountains, her scales catching the dawn light. "
        "Below, a village stirred awake, smoke rising from chimneys. "
    ) * 200

    with tempfile.TemporaryDirectory() as tmpdir:
        tmp = Path(tmpdir)
        corpus_dir = tmp / "clean"
        corpus_dir.mkdir()
        (corpus_dir / "story.txt").write_text(corpus_text)

        out_dir = tmp / "tokenized"
        meta = tokenize_and_shard(
            corpus_dir, out_dir, tiny_tokenizer, shard_size=1000, seed=0
        )

        assert meta["total_tokens"] > 0
        assert (out_dir / "meta.json").exists()

        # Check at least one shard exists
        train_shards = list((out_dir / "train").glob("*.bin"))
        assert len(train_shards) > 0

        # Load a shard and verify dtype and bounds
        arr = np.fromfile(train_shards[0], dtype=np.uint16)
        assert len(arr) > 0
        assert int(arr.max()) < tiny_tokenizer.vocab_size


def test_binary_shard_dataset(tiny_tokenizer) -> None:
    """BinaryShardDataset returns correct (x, y) pairs."""
    from data.tokenize_corpus import tokenize_and_shard, BinaryShardDataset

    corpus_text = "Once upon a time in a land far away. " * 500

    with tempfile.TemporaryDirectory() as tmpdir:
        tmp = Path(tmpdir)
        corpus_dir = tmp / "clean"
        corpus_dir.mkdir()
        (corpus_dir / "story.txt").write_text(corpus_text)
        out_dir = tmp / "tok"

        tokenize_and_shard(corpus_dir, out_dir, tiny_tokenizer, shard_size=2000, seed=1)

        train_dir = out_dir / "train"
        if not list(train_dir.glob("*.bin")):
            pytest.skip("Not enough data for train split in tiny test")

        ds = BinaryShardDataset(train_dir, block_size=32)
        x, y = ds[0]

        assert x.shape == (32,)
        assert y.shape == (32,)
        # y should be x shifted right by 1
        assert (x[1:] == y[:-1]).all()


# ---------------------------------------------------------------------------
# Instruction pair generation
# ---------------------------------------------------------------------------

def test_corpus_pairs_all_tasks() -> None:
    """corpus mode generates all 5 task types given enough documents."""
    import random
    from data.generate_instruction_pairs import _iter_corpus_pairs

    # Build a tiny corpus of varied fiction-ish paragraphs
    with tempfile.TemporaryDirectory() as tmpdir:
        corpus_dir = Path(tmpdir)
        for i in range(20):
            text = (
                f"Chapter {i+1}\n\n"
                "The captain stood at the helm as the storm approached from the north. "
                "Lightning split the sky and the crew braced themselves against the railing. "
                "She had sailed through worse, but never with so much at stake.\n\n"
                "Below deck, the prisoner listened to the thunder and smiled. "
                "This was the moment she had waited three years for. "
                "The lock on the door was old iron — nothing she could not manage.\n\n"
                "When the ship lurched, she moved.\n\n"
            ) * 5
            (corpus_dir / f"story_{i:03d}.txt").write_text(text)

        rng = random.Random(42)
        pairs = list(_iter_corpus_pairs(corpus_dir, n=25, rng=rng))

    assert len(pairs) > 0
    tasks_seen = {p["task"] for p in pairs}
    # Should see at least 3 of the 5 task types with 25 samples
    assert len(tasks_seen) >= 3

    for pair in pairs:
        assert "task" in pair
        assert "text" in pair
        assert len(pair["text"]) > 50
