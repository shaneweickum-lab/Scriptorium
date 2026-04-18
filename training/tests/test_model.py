"""Unit tests for MavenSLM model architecture.

Run with:  pytest training/tests/test_model.py -v
"""

import math
import sys
from pathlib import Path

import pytest
import torch

sys.path.insert(0, str(Path(__file__).parent.parent))
from maven_slm import MavenSLM, MavenSLMConfig


# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------

@pytest.fixture
def tiny_config() -> MavenSLMConfig:
    """Minimal config for fast CPU tests."""
    return MavenSLMConfig(
        vocab_size=256,
        d_model=64,
        n_heads=4,
        n_layers=2,
        ffn_dim=192,   # 3 × d_model
        max_seq_len=32,
        dropout=0.0,
    )


@pytest.fixture
def tiny_model(tiny_config: MavenSLMConfig) -> MavenSLM:
    model = MavenSLM(tiny_config)
    model.eval()
    return model


# ---------------------------------------------------------------------------
# Forward pass
# ---------------------------------------------------------------------------

def test_forward_output_shape(tiny_model: MavenSLM, tiny_config: MavenSLMConfig) -> None:
    B, T = 2, 16
    input_ids = torch.randint(0, tiny_config.vocab_size, (B, T))
    logits, loss = tiny_model(input_ids)

    assert logits.shape == (B, T, tiny_config.vocab_size), (
        f"Expected logits shape {(B, T, tiny_config.vocab_size)}, got {logits.shape}"
    )
    assert loss is None


def test_forward_with_targets(tiny_model: MavenSLM, tiny_config: MavenSLMConfig) -> None:
    B, T = 2, 16
    input_ids = torch.randint(0, tiny_config.vocab_size, (B, T))
    targets   = torch.randint(0, tiny_config.vocab_size, (B, T))
    logits, loss = tiny_model(input_ids, targets)

    assert logits.shape == (B, T, tiny_config.vocab_size)
    assert loss is not None
    assert loss.ndim == 0, "Loss should be a scalar"
    assert loss.item() > 0


def test_ignore_index_in_loss(tiny_model: MavenSLM, tiny_config: MavenSLMConfig) -> None:
    B, T = 1, 8
    input_ids = torch.randint(0, tiny_config.vocab_size, (B, T))
    # Mask all targets → loss should be 0 (or very near 0 numerically)
    targets = torch.full((B, T), -1, dtype=torch.long)
    _, loss = tiny_model(input_ids, targets)
    assert loss.item() == pytest.approx(0.0, abs=1e-5)


def test_max_seq_len_respected(tiny_model: MavenSLM, tiny_config: MavenSLMConfig) -> None:
    input_ids = torch.randint(0, tiny_config.vocab_size, (1, tiny_config.max_seq_len))
    logits, _ = tiny_model(input_ids)
    assert logits.shape[1] == tiny_config.max_seq_len


def test_exceeds_max_seq_len_raises(tiny_model: MavenSLM, tiny_config: MavenSLMConfig) -> None:
    input_ids = torch.randint(0, tiny_config.vocab_size, (1, tiny_config.max_seq_len + 1))
    with pytest.raises(AssertionError):
        tiny_model(input_ids)


# ---------------------------------------------------------------------------
# Causal masking (autoregressive property)
# ---------------------------------------------------------------------------

def test_causal_mask(tiny_config: MavenSLMConfig) -> None:
    """Logits at position i must not depend on tokens at position j > i."""
    model = MavenSLM(tiny_config)
    model.eval()

    T = 12
    tokens = torch.randint(0, tiny_config.vocab_size, (1, T))

    with torch.no_grad():
        logits_orig, _ = model(tokens)

    # Mutate token at position 6 — positions 0..5 must be unchanged
    tokens_mut = tokens.clone()
    tokens_mut[0, 6] = (tokens[0, 6].item() + 1) % tiny_config.vocab_size

    with torch.no_grad():
        logits_mut, _ = model(tokens_mut)

    assert torch.allclose(logits_orig[0, :6], logits_mut[0, :6], atol=1e-5), (
        "Causal mask violated: positions before the mutation changed"
    )
    # Position 6 and beyond may differ (mutation affects its own logit
    # and all subsequent positions that attend to it)


# ---------------------------------------------------------------------------
# Parameter count
# ---------------------------------------------------------------------------

def test_param_count_full_config() -> None:
    """Verify the default 50 M config produces ~50 M unique parameters."""
    config = MavenSLMConfig()
    model  = MavenSLM(config)
    counts = model.param_count()

    unique = counts["unique_params"]
    target = 50_000_000
    tolerance = 5_000_000  # ±5 M

    assert abs(unique - target) < tolerance, (
        f"Expected ~{target:,} unique params, got {unique:,}"
    )


def test_param_count_structure(tiny_model: MavenSLM) -> None:
    counts = tiny_model.param_count()
    assert "unique_params"   in counts
    assert "total_with_ties" in counts
    assert "embedding_params" in counts
    assert "tied_savings"    in counts
    # Weight tying should save exactly vocab_size × d_model parameters
    assert counts["tied_savings"] == counts["embedding_params"]


def test_weight_tying(tiny_model: MavenSLM) -> None:
    """LM head and token embedding must share the same tensor."""
    assert tiny_model.lm_head.weight is tiny_model.tok_emb.weight, (
        "Weight tying broken: lm_head.weight and tok_emb.weight are different tensors"
    )


# ---------------------------------------------------------------------------
# RMSNorm
# ---------------------------------------------------------------------------

def test_rmsnorm_normalises() -> None:
    from maven_slm.model import RMSNorm
    norm = RMSNorm(64)
    x = torch.randn(4, 16, 64) * 100   # large scale should be normalised
    out = norm(x)
    # RMS of output should be close to 1 (before learnable scale)
    # With learned scale initialised to 1, output RMS ≈ 1
    rms = out.pow(2).mean(-1).sqrt()
    assert rms.mean().item() == pytest.approx(1.0, abs=0.1)


# ---------------------------------------------------------------------------
# RoPE
# ---------------------------------------------------------------------------

def test_rope_output_shape() -> None:
    from maven_slm.model import precompute_rope_freqs, apply_rope
    head_dim, T = 64, 16
    cos, sin = precompute_rope_freqs(head_dim, max_seq_len=128)
    x = torch.randn(2, 4, T, head_dim)
    out = apply_rope(x, cos[:T], sin[:T])
    assert out.shape == x.shape


def test_rope_preserves_norm() -> None:
    """RoPE is a rotation — it must preserve the L2 norm of each vector."""
    from maven_slm.model import precompute_rope_freqs, apply_rope
    head_dim, T = 64, 8
    cos, sin = precompute_rope_freqs(head_dim, max_seq_len=32)
    x = torch.randn(1, 2, T, head_dim)
    out = apply_rope(x, cos[:T], sin[:T])
    assert torch.allclose(x.norm(dim=-1), out.norm(dim=-1), atol=1e-5), (
        "RoPE changed vector norms — rotation property violated"
    )


# ---------------------------------------------------------------------------
# Generation
# ---------------------------------------------------------------------------

def test_generate_length(tiny_model: MavenSLM, tiny_config: MavenSLMConfig) -> None:
    prompt = torch.randint(0, tiny_config.vocab_size, (1, 4))
    out = tiny_model.generate(prompt, max_new_tokens=8, temperature=1.0)
    assert out.shape == (1, 4 + 8)


def test_generate_deterministic_at_zero_temp(
    tiny_model: MavenSLM, tiny_config: MavenSLMConfig
) -> None:
    torch.manual_seed(42)
    prompt = torch.randint(0, tiny_config.vocab_size, (1, 4))
    out1 = tiny_model.generate(prompt.clone(), max_new_tokens=5, temperature=1e-8)
    out2 = tiny_model.generate(prompt.clone(), max_new_tokens=5, temperature=1e-8)
    assert torch.equal(out1, out2), "Near-zero temperature should be deterministic"
