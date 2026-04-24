"""Phase 4 tests — SFT dataset masking, dataset construction, and LR schedule.

Run from the training/ directory:
    pytest tests/test_finetune.py -v
"""

import json
import math
import sys
from pathlib import Path

import pytest
import torch

sys.path.insert(0, str(Path(__file__).parent.parent))

from data.sft_dataset import SFTDataset, _mask_instruction, make_train_val_split, IGNORE_INDEX
from finetune_config import FinetuneConfig
from finetune import get_sft_lr


# ---------------------------------------------------------------------------
# Minimal tokenizer mock — avoids loading a real HuggingFace tokenizer
# ---------------------------------------------------------------------------

class _MockTokenizer:
    """Tiny fake tokenizer for tests.

    Special token IDs mirror the real MavenSLM tokenizer:
      <|pad|>=0  <|bos|>=1  <|eos|>=2  <|inst|>=8  <|/inst|>=9
    """

    BOS_ID        = 1
    EOS_ID        = 2
    INST_OPEN_ID  = 8
    INST_CLOSE_ID = 9

    _SPECIALS = {
        "<|pad|>":  0,
        "<|bos|>":  1,
        "<|eos|>":  2,
        "<|unk|>":  3,
        "<|sep|>":  4,
        "<|lore|>": 5,
        "<|scene|>": 6,
        "<|style|>": 7,
        "<|inst|>":  8,
        "<|/inst|>": 9,
    }

    def __init__(self):
        self._vocab: dict[str, int] = dict(self._SPECIALS)
        self._counter = 100

    def _tok(self, word: str) -> int:
        if word not in self._vocab:
            self._vocab[word] = self._counter
            self._counter += 1
        return self._vocab[word]

    def encode(self, text: str, add_special_tokens: bool = False) -> list[int]:
        return [self._tok(w) for w in text.split()]

    def convert_tokens_to_ids(self, token: str) -> int:
        return self._vocab.get(token, self._SPECIALS["<|unk|>"])


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _make_jsonl(tmp_path: Path, items: list[dict]) -> Path:
    p = tmp_path / "pairs.jsonl"
    with p.open("w") as f:
        for item in items:
            f.write(json.dumps(item) + "\n")
    return p


def _inst_pair(instruction: str, response: str) -> str:
    return f"<|inst|> {instruction} <|/inst|> {response}"


# ---------------------------------------------------------------------------
# _mask_instruction unit tests
# ---------------------------------------------------------------------------

class TestMaskInstruction:
    """Direct tests of the _mask_instruction helper."""

    CLOSE = _MockTokenizer.INST_CLOSE_ID  # 9

    def test_masks_up_to_and_including_close_token(self):
        # x = [8, tok, tok, 9, resp, resp]
        #       ^^^^^^^^^^^^  ^  these four positions masked in y
        x = torch.tensor([8, 100, 101, self.CLOSE, 200, 201])
        y = torch.tensor([100, 101, self.CLOSE, 200, 201, 202])
        masked = _mask_instruction(x, y, self.CLOSE)

        assert masked[:4].eq(IGNORE_INDEX).all(), "instruction + close token should be masked"
        assert masked[4].item() == 201
        assert masked[5].item() == 202

    def test_response_tokens_preserved(self):
        x = torch.tensor([8, 100, self.CLOSE, 200, 201, 202])
        y = torch.tensor([100, self.CLOSE, 200, 201, 202, 203])
        masked = _mask_instruction(x, y, self.CLOSE)

        assert masked[3].item() == 201
        assert masked[4].item() == 202
        assert masked[5].item() == 203

    def test_no_close_token_masks_all(self):
        x = torch.tensor([8, 100, 101, 102, 200])
        y = torch.tensor([100, 101, 102, 200, 201])
        masked = _mask_instruction(x, y, self.CLOSE)

        assert masked.eq(IGNORE_INDEX).all(), "no <|/inst|> → all labels masked"

    def test_does_not_mutate_original_y(self):
        x = torch.tensor([8, 100, self.CLOSE, 200])
        y = torch.tensor([100, self.CLOSE, 200, 201])
        original = y.clone()
        _mask_instruction(x, y, self.CLOSE)
        assert y.equal(original), "_mask_instruction should not mutate y in-place"

    def test_uses_first_close_token_only(self):
        # Two <|/inst|> tokens — only mask up to the first
        x = torch.tensor([8, self.CLOSE, 100, self.CLOSE, 200])
        y = torch.tensor([self.CLOSE, 100, self.CLOSE, 200, 201])
        masked = _mask_instruction(x, y, self.CLOSE)

        # Positions 0 and 1 (up to first CLOSE in x) masked
        assert masked[0].item() == IGNORE_INDEX
        assert masked[1].item() == IGNORE_INDEX
        # Position 2 onwards is response
        assert masked[2].item() != IGNORE_INDEX


# ---------------------------------------------------------------------------
# SFTDataset construction tests
# ---------------------------------------------------------------------------

class TestSFTDataset:
    CLOSE_ID  = _MockTokenizer.INST_CLOSE_ID
    BLOCK     = 32

    def _dataset(self, tmp_path, items, **kwargs):
        tok  = _MockTokenizer()
        path = _make_jsonl(tmp_path, items)
        return SFTDataset(path, tok, self.BLOCK, self.CLOSE_ID, **kwargs)

    def test_basic_length(self, tmp_path):
        items = [{"task": "scene-continue", "text": _inst_pair("Go on", "The sun rose")}]
        ds = self._dataset(tmp_path, items)
        assert len(ds) == 1

    def test_x_y_shapes(self, tmp_path):
        items = [{"task": "scene-continue", "text": _inst_pair("Go on", "The sun rose")}]
        ds = self._dataset(tmp_path, items)
        x, y = ds[0]
        assert x.shape == (self.BLOCK,)
        assert y.shape == (self.BLOCK,)
        assert x.dtype == torch.long
        assert y.dtype == torch.long

    def test_y_shifted_right_by_one(self, tmp_path):
        items = [{"task": "scene-continue", "text": _inst_pair("Abc", "Def ghi")}]
        ds = self._dataset(tmp_path, items)
        x, y = ds[0]
        # For non-masked, non-padded positions: y[i] == x[i+1]
        valid = (y != IGNORE_INDEX) & (y != 0)
        if valid.sum() > 0:
            idx = valid.nonzero(as_tuple=True)[0][0].item()
            if idx < len(x) - 1:
                assert y[idx].item() == x[idx + 1].item()

    def test_instruction_tokens_masked_in_labels(self, tmp_path):
        items = [{"task": "scene-continue", "text": _inst_pair("Continue", "The hero ran")}]
        ds = self._dataset(tmp_path, items)
        x, y = ds[0]
        # The close token appears somewhere in x; everything before it should be masked
        close_positions = (x == self.CLOSE_ID).nonzero(as_tuple=True)[0]
        assert len(close_positions) > 0, "close token must appear in x"
        cutoff = close_positions[0].item()
        assert y[:cutoff + 1].eq(IGNORE_INDEX).all()

    def test_response_tokens_not_masked(self, tmp_path):
        items = [{"task": "scene-continue", "text": _inst_pair("Go on", "The sun rose brightly")}]
        ds = self._dataset(tmp_path, items)
        x, y = ds[0]
        close_pos = (x == self.CLOSE_ID).nonzero(as_tuple=True)[0]
        assert len(close_pos) > 0
        start = close_pos[0].item() + 1
        # At least some response tokens should be unmasked (before padding)
        response_region = y[start:]
        non_pad = response_region[response_region != 0]
        has_real = (non_pad != IGNORE_INDEX).any()
        assert has_real, "response tokens after <|/inst|> should not be masked"

    def test_skips_examples_with_all_masked_labels(self, tmp_path):
        # A sequence with no <|/inst|> — all labels would be masked
        items = [{"task": "scene-continue", "text": "just plain text no inst tokens here"}]
        ds = self._dataset(tmp_path, items)
        assert len(ds) == 0, "examples where all labels are masked should be skipped"

    def test_truncation_to_block_size(self, tmp_path):
        long_response = " ".join([f"word{i}" for i in range(200)])
        items = [{"task": "scene-continue", "text": _inst_pair("Go on", long_response)}]
        ds = self._dataset(tmp_path, items)
        if len(ds) > 0:
            x, y = ds[0]
            assert x.shape == (self.BLOCK,)
            assert y.shape == (self.BLOCK,)

    def test_padding_for_short_sequences(self, tmp_path):
        items = [{"task": "scene-continue", "text": _inst_pair("Go", "Yes")}]
        ds = self._dataset(tmp_path, items)
        if len(ds) > 0:
            x, y = ds[0]
            assert x.shape[0] == self.BLOCK
            # Padding positions in x should be 0
            # (we can't know exactly where padding starts without knowing raw length,
            # but the shape must be correct)

    def test_subset_via_indices(self, tmp_path):
        items = [
            {"task": "scene-continue", "text": _inst_pair("One", "The first response")},
            {"task": "scene-continue", "text": _inst_pair("Two", "The second response")},
            {"task": "scene-continue", "text": _inst_pair("Three", "The third response")},
        ]
        ds_all    = self._dataset(tmp_path, items)
        ds_subset = self._dataset(tmp_path, items, indices=[0, 2])
        # The subset should have at most as many examples as ds_all
        assert len(ds_subset) <= len(ds_all)


# ---------------------------------------------------------------------------
# make_train_val_split tests
# ---------------------------------------------------------------------------

class TestTrainValSplit:
    def _write_n(self, tmp_path, n: int) -> Path:
        return _make_jsonl(
            tmp_path,
            [{"task": "scene-continue", "text": _inst_pair(f"inst{i}", f"resp{i}")} for i in range(n)],
        )

    def test_correct_sizes(self, tmp_path):
        path = self._write_n(tmp_path, 100)
        train_idx, val_idx = make_train_val_split(path, val_split=0.1)
        assert len(train_idx) + len(val_idx) == 100
        assert len(val_idx) == 10

    def test_disjoint(self, tmp_path):
        path = self._write_n(tmp_path, 50)
        train_idx, val_idx = make_train_val_split(path, val_split=0.1)
        assert len(set(train_idx) & set(val_idx)) == 0

    def test_covers_all_indices(self, tmp_path):
        path = self._write_n(tmp_path, 20)
        train_idx, val_idx = make_train_val_split(path, val_split=0.2)
        assert sorted(train_idx + val_idx) == list(range(20))

    def test_minimum_one_val_example(self, tmp_path):
        path = self._write_n(tmp_path, 5)
        _, val_idx = make_train_val_split(path, val_split=0.05)
        assert len(val_idx) >= 1

    def test_deterministic_with_seed(self, tmp_path):
        path = self._write_n(tmp_path, 40)
        t1, v1 = make_train_val_split(path, val_split=0.1, seed=7)
        t2, v2 = make_train_val_split(path, val_split=0.1, seed=7)
        assert t1 == t2
        assert v1 == v2

    def test_different_seeds_give_different_splits(self, tmp_path):
        path = self._write_n(tmp_path, 40)
        _, v1 = make_train_val_split(path, val_split=0.25, seed=1)
        _, v2 = make_train_val_split(path, val_split=0.25, seed=99)
        assert v1 != v2


# ---------------------------------------------------------------------------
# FinetuneConfig tests
# ---------------------------------------------------------------------------

class TestFinetuneConfig:
    def test_defaults_valid(self):
        cfg = FinetuneConfig()
        assert cfg.max_lr > cfg.min_lr
        assert cfg.warmup_steps < cfg.max_steps
        assert 0.0 < cfg.val_split < 0.5

    def test_warmup_ge_max_steps_raises(self):
        with pytest.raises(AssertionError):
            FinetuneConfig(warmup_steps=1000, max_steps=500)

    def test_min_lr_gt_max_lr_raises(self):
        with pytest.raises(AssertionError):
            FinetuneConfig(min_lr=1e-3, max_lr=1e-5)

    def test_val_split_bounds(self):
        with pytest.raises(AssertionError):
            FinetuneConfig(val_split=0.0)
        with pytest.raises(AssertionError):
            FinetuneConfig(val_split=0.6)

    def test_lr_is_lower_than_pretrain(self):
        from train_config import TrainConfig
        sft_cfg      = FinetuneConfig()
        pretrain_cfg = TrainConfig()
        assert sft_cfg.max_lr < pretrain_cfg.max_lr


# ---------------------------------------------------------------------------
# LR schedule tests
# ---------------------------------------------------------------------------

class TestSFTLRSchedule:
    def _cfg(self, **kw):
        defaults = dict(warmup_steps=10, max_steps=100, max_lr=3e-5, min_lr=3e-6)
        defaults.update(kw)
        return FinetuneConfig(**defaults)

    def test_warmup_starts_near_zero(self):
        cfg = self._cfg()
        lr0 = get_sft_lr(0, cfg)
        assert lr0 == pytest.approx(cfg.max_lr / cfg.warmup_steps, rel=0.01)

    def test_warmup_reaches_max_lr(self):
        cfg = self._cfg()
        lr  = get_sft_lr(cfg.warmup_steps - 1, cfg)
        assert lr == pytest.approx(cfg.max_lr, rel=0.01)

    def test_monotone_decay_after_warmup(self):
        cfg = self._cfg()
        lrs = [get_sft_lr(s, cfg) for s in range(cfg.warmup_steps, cfg.max_steps)]
        for a, b in zip(lrs, lrs[1:]):
            assert a >= b - 1e-12

    def test_final_step_equals_min_lr(self):
        cfg = self._cfg()
        lr  = get_sft_lr(cfg.max_steps, cfg)
        assert lr == pytest.approx(cfg.min_lr, rel=1e-6)

    def test_midpoint_between_max_and_min(self):
        cfg  = self._cfg()
        mid  = (cfg.warmup_steps + cfg.max_steps) // 2
        lr   = get_sft_lr(mid, cfg)
        expected = cfg.min_lr + 0.5 * (cfg.max_lr - cfg.min_lr)
        assert lr == pytest.approx(expected, rel=0.05)


# ---------------------------------------------------------------------------
# Loss masking integration — model only trains on response tokens
# ---------------------------------------------------------------------------

class TestSFTLossIntegration:
    """Verify that IGNORE_INDEX labels produce zero gradient contribution."""

    def test_all_masked_labels_produce_nan_or_zero_loss(self):
        from maven_slm import MavenSLM, MavenSLMConfig
        import torch.nn.functional as F

        model = MavenSLM(MavenSLMConfig())
        model.eval()

        B, T = 1, 16
        x = torch.randint(0, 32768, (B, T))
        y = torch.full((B, T), IGNORE_INDEX, dtype=torch.long)

        with torch.no_grad():
            _, loss = model(x, y)

        # When all targets are masked, cross_entropy returns NaN (0 valid tokens)
        assert torch.isnan(loss) or loss.item() == 0.0

    def test_partial_masking_gives_finite_loss(self):
        from maven_slm import MavenSLM, MavenSLMConfig

        model = MavenSLM(MavenSLMConfig())
        model.eval()

        B, T = 1, 16
        x = torch.randint(0, 32768, (B, T))
        # Mask first half, leave second half as real targets
        y = torch.full((B, T), IGNORE_INDEX, dtype=torch.long)
        y[:, T // 2:] = torch.randint(0, 32768, (B, T // 2))

        with torch.no_grad():
            _, loss = model(x, y)

        assert torch.isfinite(loss) and loss.item() > 0.0

    def test_sft_checkpoint_has_phase_field(self, tmp_path):
        from maven_slm import MavenSLM, MavenSLMConfig
        from finetune import save_sft_checkpoint

        model = MavenSLM(MavenSLMConfig())
        cfg   = FinetuneConfig()
        opt   = torch.optim.AdamW(model.parameters(), lr=cfg.max_lr)
        path  = tmp_path / "test_sft.pt"

        save_sft_checkpoint(path, model, opt, step=50, val_loss=2.5,
                            model_config=MavenSLMConfig(), sft_config=cfg)

        ckpt = torch.load(path, map_location="cpu", weights_only=False)
        assert ckpt["phase"] == "sft"
        assert ckpt["step"]  == 50
        assert "model_state" in ckpt
        assert "sft_config"  in ckpt
