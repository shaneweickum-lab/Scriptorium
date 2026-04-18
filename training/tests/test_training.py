"""Tests for Phase 3 training infrastructure.

Run with:  pytest training/tests/test_training.py -v

Tests:
  - LR schedule values at warmup end, midpoint, final step
  - Gradient accumulation equivalence (4 micro-steps == 1 large batch)
  - Checkpoint save/load restores identical model outputs
  - Overfit smoke test: model reaches loss < 0.5 on a fixed tiny batch
  - ShardLoader returns correct (x, y) shifted pairs
"""

import math
import sys
import tempfile
from pathlib import Path

import numpy as np
import pytest
import torch

sys.path.insert(0, str(Path(__file__).parent.parent))
from maven_slm import MavenSLM, MavenSLMConfig
from train import get_lr, ShardLoader, save_checkpoint, load_checkpoint
from train_config import TrainConfig


# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------

@pytest.fixture
def tiny_config() -> MavenSLMConfig:
    return MavenSLMConfig(
        vocab_size=256, d_model=64, n_heads=4, n_layers=2,
        ffn_dim=192, max_seq_len=32, dropout=0.0,
    )


@pytest.fixture
def tiny_train_cfg() -> TrainConfig:
    return TrainConfig(
        micro_batch_size=2,
        grad_accum_steps=2,
        block_size=16,
        max_steps=100,
        warmup_steps=10,
        max_lr=1e-3,
        min_lr=1e-4,
    )


@pytest.fixture
def tiny_model(tiny_config) -> MavenSLM:
    torch.manual_seed(0)
    return MavenSLM(tiny_config)


# ---------------------------------------------------------------------------
# LR schedule
# ---------------------------------------------------------------------------

def test_lr_warmup_start(tiny_train_cfg) -> None:
    """LR at step 0 should be max_lr / warmup_steps (first step of warmup)."""
    lr = get_lr(0, tiny_train_cfg)
    expected = tiny_train_cfg.max_lr * 1 / tiny_train_cfg.warmup_steps
    assert lr == pytest.approx(expected, rel=1e-5)


def test_lr_warmup_end(tiny_train_cfg) -> None:
    """LR at end of warmup should equal max_lr."""
    lr = get_lr(tiny_train_cfg.warmup_steps - 1, tiny_train_cfg)
    assert lr == pytest.approx(tiny_train_cfg.max_lr, rel=1e-3)


def test_lr_midpoint(tiny_train_cfg) -> None:
    """LR at midpoint of cosine decay should be halfway between max and min."""
    mid = (tiny_train_cfg.max_steps + tiny_train_cfg.warmup_steps) // 2
    lr  = get_lr(mid, tiny_train_cfg)
    expected = tiny_train_cfg.min_lr + 0.5 * (tiny_train_cfg.max_lr - tiny_train_cfg.min_lr)
    assert lr == pytest.approx(expected, rel=0.05)


def test_lr_final_step(tiny_train_cfg) -> None:
    """LR at max_steps should equal min_lr."""
    lr = get_lr(tiny_train_cfg.max_steps, tiny_train_cfg)
    assert lr == pytest.approx(tiny_train_cfg.min_lr, rel=1e-5)


def test_lr_monotone_decay(tiny_train_cfg) -> None:
    """LR must be non-increasing after the warmup phase."""
    steps = range(tiny_train_cfg.warmup_steps, tiny_train_cfg.max_steps + 1)
    lrs   = [get_lr(s, tiny_train_cfg) for s in steps]
    for i in range(1, len(lrs)):
        assert lrs[i] <= lrs[i - 1] + 1e-10, f"LR increased at step {steps[i]}"


# ---------------------------------------------------------------------------
# Gradient accumulation equivalence
# ---------------------------------------------------------------------------

def test_grad_accum_equivalence(tiny_config, tiny_model) -> None:
    """Accumulated gradients over N micro-steps must equal 1 large-batch grad."""
    torch.manual_seed(1)
    model_a = MavenSLM(tiny_config)
    model_b = MavenSLM(tiny_config)
    # Identical weights
    model_b.load_state_dict(model_a.state_dict())

    # Fixed batches
    B, T = 2, 16
    x1 = torch.randint(0, tiny_config.vocab_size, (B, T))
    y1 = torch.randint(0, tiny_config.vocab_size, (B, T))
    x2 = torch.randint(0, tiny_config.vocab_size, (B, T))
    y2 = torch.randint(0, tiny_config.vocab_size, (B, T))

    # Model A: single forward on concatenated batch
    x_full = torch.cat([x1, x2], dim=0)
    y_full = torch.cat([y1, y2], dim=0)
    _, loss_a = model_a(x_full, y_full)
    loss_a.backward()

    # Model B: two micro-steps with /2 normalisation
    _, loss_b1 = model_b(x1, y1)
    (loss_b1 / 2).backward()
    _, loss_b2 = model_b(x2, y2)
    (loss_b2 / 2).backward()

    # Gradients should be equal
    for (na, pa), (nb, pb) in zip(model_a.named_parameters(), model_b.named_parameters()):
        if pa.grad is not None and pb.grad is not None:
            assert torch.allclose(pa.grad, pb.grad, atol=1e-5), (
                f"Gradient mismatch for {na}"
            )


# ---------------------------------------------------------------------------
# Checkpoint save / load
# ---------------------------------------------------------------------------

def test_checkpoint_roundtrip(tiny_model, tiny_config, tiny_train_cfg) -> None:
    """Saving and loading a checkpoint must produce identical model outputs."""
    optimizer = torch.optim.AdamW(tiny_model.parameters(), lr=1e-3)

    with tempfile.TemporaryDirectory() as tmpdir:
        ckpt_path = Path(tmpdir) / "test.pt"
        save_checkpoint(ckpt_path, tiny_model, optimizer, step=10,
                        val_loss=3.5, model_config=tiny_config,
                        train_config=tiny_train_cfg)

        # Create fresh model + optimizer and load
        model2 = MavenSLM(tiny_config)
        opt2   = torch.optim.AdamW(model2.parameters(), lr=1e-3)
        step, val_loss = load_checkpoint(ckpt_path, model2, opt2)

    assert step     == 10
    assert val_loss == pytest.approx(3.5)

    # Outputs must be identical
    torch.manual_seed(99)
    x = torch.randint(0, tiny_config.vocab_size, (1, 8))
    with torch.no_grad():
        logits_orig, _ = tiny_model(x)
        logits_load, _ = model2(x)
    assert torch.allclose(logits_orig, logits_load, atol=1e-6)


def test_checkpoint_contains_required_keys(tiny_model, tiny_config, tiny_train_cfg) -> None:
    with tempfile.TemporaryDirectory() as tmpdir:
        ckpt_path = Path(tmpdir) / "keys.pt"
        optimizer = torch.optim.AdamW(tiny_model.parameters(), lr=1e-3)
        save_checkpoint(ckpt_path, tiny_model, optimizer, step=5,
                        val_loss=4.0, model_config=tiny_config,
                        train_config=tiny_train_cfg)
        ckpt = torch.load(ckpt_path, map_location="cpu", weights_only=False)

    for key in ("step", "model_state", "optimizer_state", "val_loss",
                "model_config", "train_config"):
        assert key in ckpt, f"Missing key: {key}"


# ---------------------------------------------------------------------------
# ShardLoader
# ---------------------------------------------------------------------------

def test_shard_loader_shape(tiny_train_cfg) -> None:
    """ShardLoader.next_batch() must return (x, y) of shape (batch, block)."""
    block  = tiny_train_cfg.block_size
    n_toks = 2000
    with tempfile.TemporaryDirectory() as tmpdir:
        shard_dir = Path(tmpdir)
        arr = np.arange(n_toks, dtype=np.uint16)
        arr.tofile(shard_dir / "shard_000000.bin")

        loader = ShardLoader(shard_dir, batch_size=tiny_train_cfg.micro_batch_size,
                             block_size=block, device=torch.device("cpu"))
        x, y = loader.next_batch()

    assert x.shape == (tiny_train_cfg.micro_batch_size, block)
    assert y.shape == (tiny_train_cfg.micro_batch_size, block)
    # y must be x shifted right by 1
    assert (x[:, 1:] == y[:, :-1]).all()


def test_shard_loader_token_ids_in_range() -> None:
    vocab_size = 1000
    n_toks     = 5000
    with tempfile.TemporaryDirectory() as tmpdir:
        shard_dir = Path(tmpdir)
        arr = np.random.randint(0, vocab_size, size=n_toks, dtype=np.uint16)
        arr.tofile(shard_dir / "shard_000000.bin")

        loader = ShardLoader(shard_dir, batch_size=4, block_size=32,
                             device=torch.device("cpu"))
        for _ in range(10):
            x, y = loader.next_batch()
            assert x.min().item() >= 0
            assert x.max().item() < vocab_size
            assert y.max().item() < vocab_size


# ---------------------------------------------------------------------------
# Overfit smoke test
# ---------------------------------------------------------------------------

def test_overfit_single_batch(tiny_config) -> None:
    """A model must be able to overfit a fixed tiny batch to loss < 0.5."""
    torch.manual_seed(7)
    model = MavenSLM(tiny_config)
    model.train()
    optimizer = torch.optim.AdamW(model.parameters(), lr=5e-3, weight_decay=0.0)

    B, T = 1, 8
    x = torch.randint(0, tiny_config.vocab_size, (B, T))
    y = torch.randint(0, tiny_config.vocab_size, (B, T))

    initial_loss = None
    for step in range(300):
        optimizer.zero_grad()
        _, loss = model(x, y)
        loss.backward()
        optimizer.step()
        if initial_loss is None:
            initial_loss = loss.item()

    final_loss = loss.item()
    assert final_loss < 0.5, (
        f"Model failed to overfit: initial={initial_loss:.3f}, final={final_loss:.3f}"
    )
    assert final_loss < initial_loss * 0.1, (
        "Loss should drop by at least 10× during overfitting"
    )


# ---------------------------------------------------------------------------
# TrainConfig
# ---------------------------------------------------------------------------

def test_effective_batch_tokens() -> None:
    cfg = TrainConfig(micro_batch_size=4, grad_accum_steps=32, block_size=2048)
    assert cfg.effective_batch_tokens() == 4 * 32 * 2048


def test_train_config_assertion() -> None:
    with pytest.raises(AssertionError):
        TrainConfig(warmup_steps=500, max_steps=100)  # warmup > max
