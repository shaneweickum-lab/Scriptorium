"""Unit tests for the MavenSLM tokenizer.

Trains a tiny tokenizer from a small in-memory corpus so no external
files are required. Tests special tokens, roundtrip encoding, and the
writing-biased punctuation handling.

Run with:  pytest training/tests/test_tokenizer.py -v
"""

import sys
import tempfile
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).parent.parent))
from tokenizer.train_tokenizer import (
    SPECIAL_TOKENS,
    BOS_ID,
    EOS_ID,
    PAD_ID,
    train,
)

# Small fiction-style corpus for fast tokenizer training in tests
SAMPLE_CORPUS = """
The old wizard pressed his palm against the runed stone gate.
"You shall not pass," he whispered, his voice cracking with age.
Elara watched from the shadows, her heart hammering against her ribs.
She had never seen the Sentinel respond to anyone before — let alone tremble.
The gate groaned. Frost crept along the hinges. Then silence.
"What did you do?" she breathed.
He turned, his eyes hollow with a grief older than the mountain itself.
"I opened it," he said. "The question is whether we should have."
The world beyond the gate smelled of pine and old rain, and something else —
something she had no name for, a scent like lightning before it strikes.
They stepped through together, and the gate sealed behind them with a sound like a held breath finally released.
Somewhere in the dark ahead, water dripped in irregular intervals, marking time by a clock that had no hands.
Elara kept her hand on her blade. The wizard kept his on his silence.
"""

SAMPLE_CORPUS = SAMPLE_CORPUS.strip() * 50  # Repeat for enough training signal


@pytest.fixture(scope="module")
def trained_tokenizer():
    """Train a small tokenizer once for all tests in this module."""
    with tempfile.TemporaryDirectory() as tmpdir:
        corpus_file = Path(tmpdir) / "corpus.txt"
        corpus_file.write_text(SAMPLE_CORPUS, encoding="utf-8")
        out_dir = Path(tmpdir) / "maven-tokenizer"
        tok = train([str(corpus_file)], str(out_dir), vocab_size=512)
        yield tok


# ---------------------------------------------------------------------------
# Special tokens
# ---------------------------------------------------------------------------

def test_special_tokens_present(trained_tokenizer) -> None:
    for token in SPECIAL_TOKENS:
        assert token in trained_tokenizer.get_vocab(), (
            f"Special token '{token}' missing from vocabulary"
        )


def test_pad_token_id(trained_tokenizer) -> None:
    assert trained_tokenizer.pad_token == "<|pad|>"
    assert trained_tokenizer.pad_token_id == PAD_ID


def test_bos_eos_ids(trained_tokenizer) -> None:
    assert trained_tokenizer.bos_token_id == BOS_ID
    assert trained_tokenizer.eos_token_id == EOS_ID


def test_special_tokens_not_split(trained_tokenizer) -> None:
    """Special tokens must encode as single token IDs, never split."""
    for token in SPECIAL_TOKENS:
        ids = trained_tokenizer.encode(token, add_special_tokens=False)
        assert len(ids) == 1, (
            f"'{token}' encoded as {len(ids)} tokens instead of 1"
        )


# ---------------------------------------------------------------------------
# Roundtrip
# ---------------------------------------------------------------------------

def test_roundtrip_plain_text(trained_tokenizer) -> None:
    text = "The wizard stepped through the gate."
    ids = trained_tokenizer.encode(text, add_special_tokens=False)
    decoded = trained_tokenizer.decode(ids, skip_special_tokens=True)
    assert decoded.strip() == text.strip()


def test_roundtrip_with_special_tokens(trained_tokenizer) -> None:
    text = "<|inst|> Continue the story. <|/inst|>"
    ids = trained_tokenizer.encode(text, add_special_tokens=False)
    decoded = trained_tokenizer.decode(ids, skip_special_tokens=False)
    assert "<|inst|>" in decoded
    assert "<|/inst|>" in decoded


# ---------------------------------------------------------------------------
# Writing-specific punctuation
# ---------------------------------------------------------------------------

def test_em_dash_preserved(trained_tokenizer) -> None:
    text = "She ran — and never looked back."
    ids = trained_tokenizer.encode(text, add_special_tokens=False)
    decoded = trained_tokenizer.decode(ids, skip_special_tokens=True)
    assert "—" in decoded, "Em-dash was not preserved in roundtrip"


def test_ellipsis_preserved(trained_tokenizer) -> None:
    text = "He waited… but she never came."
    ids = trained_tokenizer.encode(text, add_special_tokens=False)
    decoded = trained_tokenizer.decode(ids, skip_special_tokens=True)
    assert "…" in decoded or "..." in decoded


def test_dialogue_quotes_preserved(trained_tokenizer) -> None:
    text = "\u201cYou shall not pass,\u201d he said."
    ids = trained_tokenizer.encode(text, add_special_tokens=False)
    decoded = trained_tokenizer.decode(ids, skip_special_tokens=True)
    # Curly quotes or straight quotes both acceptable after NFC normalisation
    assert "You shall not pass" in decoded


# ---------------------------------------------------------------------------
# Encoding properties
# ---------------------------------------------------------------------------

def test_vocab_size_within_bounds(trained_tokenizer) -> None:
    assert trained_tokenizer.vocab_size <= 512 + len(SPECIAL_TOKENS)


def test_encoding_returns_integers(trained_tokenizer) -> None:
    ids = trained_tokenizer.encode("Hello, world!", add_special_tokens=False)
    assert all(isinstance(i, int) for i in ids)
    assert all(0 <= i < trained_tokenizer.vocab_size for i in ids)


def test_longer_text_produces_more_tokens(trained_tokenizer) -> None:
    short = trained_tokenizer.encode("Hello.", add_special_tokens=False)
    long  = trained_tokenizer.encode("Hello. " * 20, add_special_tokens=False)
    assert len(long) > len(short)


def test_lore_template_roundtrip(trained_tokenizer) -> None:
    """Verify the lore-injection template encodes and decodes cleanly."""
    template = (
        "<|lore|> Elara is a shadow-mage who cannot cast spells in daylight. "
        "<|scene|> Elara entered the sunlit courtyard and raised her hands. "
        "<|inst|> Continue the scene, respecting the lore constraint. <|/inst|>"
    )
    ids = trained_tokenizer.encode(template, add_special_tokens=False)
    decoded = trained_tokenizer.decode(ids, skip_special_tokens=False)
    assert "<|lore|>" in decoded
    assert "<|scene|>" in decoded
    assert "<|inst|>" in decoded
    assert "<|/inst|>" in decoded
