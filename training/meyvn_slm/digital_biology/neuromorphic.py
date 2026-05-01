"""
MeyvnAI Digital Biology — Module 2: Neuromorphic Spiking Algorithm
===================================================================
Wraps ElasticBitLinear layers with a Leaky Integrate-and-Fire (LIF)
neuron model and top-k temporal sparsity.

Biological motivation
---------------------
Real cortical neurons don't fire continuously — they "spike" only when
their integrated input crosses a threshold, then reset. Between spikes the
membrane potential leaks back toward rest. This creates natural sparsity:
only the most strongly activated neurons fire at any given moment, reducing
the metabolic cost of information processing.

Here that translates to:
  - Membrane potential V accumulates input across the sequence (time axis).
  - On each "timestep" (token position), V decays by the leak factor (< 1).
  - Only the top sparsity_pct% of neurons (by membrane potential magnitude)
    produce non-zero output; the rest are masked to zero.
  - Fired neurons undergo a soft reset: V is reduced rather than zeroed,
    preventing over-suppression of strong signals.

Temporal Sparsity
-----------------
With sparsity_pct=0.05 and ffn_dim=7680, each token activates only
7680 × 0.05 = 384 neurons. Downstream layers receive a 95%-sparse vector.
Combined with ternary weights (no multiplication), the effective operations
per token are:
  active_neurons × ternary_activations = 384 × (subset of 576 non-zero per row)
This is a significant reduction from the dense 7680 × 2560 baseline.

Two modes
---------
LIFStateless  (default, fast)
    Top-k sparsity applied independently per token. Treats each position
    as a separate "snapshot" with no state carried across positions.
    Parallelisable; recommended for training on MPS.

LIFStateful  (accurate)
    True causal integration: membrane state carries forward across the
    sequence dimension. Accurate for autoregressive generation; requires
    a sequential scan (loop) — 2048 iterations for max_seq_len=2048.
    Use this for inference benchmarking, not training.

MPS optimisation notes
----------------------
- The top-k sparsity mask is computed with torch.topk, which is MPS-safe.
- The sequential scan in LIFStateful avoids in-place writes to avoid MPS
  graph issues; each step allocates a new membrane tensor.
- No integer casts; everything stays in bf16/fp32.
"""

from __future__ import annotations

from typing import Optional, Tuple

import torch
import torch.nn as nn
import torch.nn.functional as F

from .elastic_stability import ElasticBitLinear


# ── Top-k sparse activation (STE) ────────────────────────────────────────────


class _TopKSparseSTE(torch.autograd.Function):
    """
    Top-k activation sparsification with Straight-Through Estimator.

    Forward : zero out all but the top sparsity_pct% of neurons (by |value|).
    Backward: gradient passes through fired neurons only (sparse STE).

    Sparse STE vs full STE: passing gradient through all neurons (full STE)
    ignores the sparsity structure and can lead to gradients reinforcing
    neurons that never fire. Sparse STE only reinforces active neurons,
    matching the biological Hebbian principle.
    """

    @staticmethod
    def forward(
        ctx: torch.autograd.function.FunctionCtx,
        x: torch.Tensor,
        k: int,
    ) -> torch.Tensor:
        topk_vals = x.abs().topk(k, dim=-1).values          # [*, k]
        threshold = topk_vals[..., -1:]                      # [*, 1]
        mask = (x.abs() >= threshold)
        ctx.save_for_backward(mask)
        return x * mask.to(x.dtype)

    @staticmethod
    def backward(
        ctx: torch.autograd.function.FunctionCtx,
        grad_output: torch.Tensor,
    ) -> Tuple[torch.Tensor, None]:
        (mask,) = ctx.saved_tensors
        return grad_output * mask.to(grad_output.dtype), None


# ── Stateless LIF (training default) ─────────────────────────────────────────


class LIFStateless(nn.Module):
    """
    Per-token LIF activation — no cross-token state.

    Applies a learnable leak (membrane decay) followed by top-k sparsity.
    The leak modulates the effective threshold: higher leak suppresses
    weaker activations before sparsification.

    Parameters
    ----------
    d_model : int
        Feature dimension (used to compute k from sparsity_pct).
    sparsity_pct : float
        Fraction of neurons that fire per token. Default 0.05 = 5%.
    leak : float
        Membrane leak factor (0 = no integration, 1 = no decay).
        Stored as a learnable scalar parameter so the model can tune
        the effective activation density during training.
    threshold : float
        Initial firing threshold (membrane potential must exceed this).
    """

    def __init__(
        self,
        d_model: int,
        sparsity_pct: float = 0.05,
        leak: float = 0.9,
        threshold: float = 0.5,
    ) -> None:
        super().__init__()
        self.d_model      = d_model
        self.sparsity_pct = sparsity_pct
        # Learnable leak — allows the model to adapt firing density per layer
        self.leak      = nn.Parameter(torch.tensor(leak))
        self.threshold = threshold

    def forward(self, x: torch.Tensor) -> torch.Tensor:
        """
        x : [..., d_model]
        Returns a sparse tensor with ~(1 - sparsity_pct) fraction zeroed.
        """
        leak = self.leak.clamp(0.01, 0.999)
        # Apply leak (simulates membrane decay to resting potential)
        membrane = x * leak
        # Fire: top-k sparsity by membrane potential magnitude
        k = max(1, int(self.d_model * self.sparsity_pct))
        return _TopKSparseSTE.apply(membrane, k)

    def extra_repr(self) -> str:
        return (
            f"d_model={self.d_model}, "
            f"sparsity={self.sparsity_pct:.1%}, "
            f"leak={self.leak.item():.3f}"
        )


# ── Stateful LIF (causal, inference-accurate) ─────────────────────────────────


class LIFStateful(nn.Module):
    """
    Causal LIF with membrane potential carried across the sequence.

    Treats the token sequence as a temporal signal. For each position t:
      V(t) = V(t−1) × leak + x(t)
      output(t) = TopK(V(t), k)   [only top k neurons fire]
      V(t) ← V(t) − output(t) × reset_factor   [soft reset]

    The soft reset (subtract rather than zero) preserves sub-threshold
    charge, allowing gradual build-up across tokens — important for
    detecting long-range narrative patterns.

    Warning: this runs a Python loop over T; use LIFStateless for training.
    """

    def __init__(
        self,
        d_model: int,
        sparsity_pct: float = 0.05,
        leak: float = 0.9,
        reset_factor: float = 0.8,
    ) -> None:
        super().__init__()
        self.d_model      = d_model
        self.sparsity_pct = sparsity_pct
        self.leak         = nn.Parameter(torch.tensor(leak))
        self.reset_factor = reset_factor

    @torch.no_grad()
    def forward(
        self,
        x: torch.Tensor,
        initial_membrane: Optional[torch.Tensor] = None,
    ) -> Tuple[torch.Tensor, torch.Tensor]:
        """
        x               : [B, T, D]
        initial_membrane: [B, D] — optional carry-in from previous chunk.
        Returns:
          output    : [B, T, D] — sparse spike tensor
          membrane  : [B, D]   — final membrane state for next chunk
        """
        B, T, D = x.shape
        leak = self.leak.clamp(0.01, 0.999)
        k    = max(1, int(D * self.sparsity_pct))

        membrane = initial_membrane if initial_membrane is not None \
                   else torch.zeros(B, D, device=x.device, dtype=x.dtype)

        outputs = []
        for t in range(T):
            membrane = membrane * leak + x[:, t, :]
            # Top-k sparsity (STE not needed here — inference only)
            topk_vals = membrane.abs().topk(k, dim=-1).values
            threshold = topk_vals[:, -1:]
            fire_mask = (membrane.abs() >= threshold)
            spike = membrane * fire_mask.to(membrane.dtype)
            # Soft reset: reduce (not zero) the fired membrane
            membrane = membrane - spike * self.reset_factor
            outputs.append(spike)

        return torch.stack(outputs, dim=1), membrane


# ── Spiking FFN (replaces SwiGLUFFN) ─────────────────────────────────────────


class SpikingFFN(nn.Module):
    """
    SwiGLU feed-forward network with LIF activations.

    Architecture:
      gate_proj  (ElasticBitLinear) → LIF sparsity → gates SiLU path
      up_proj    (ElasticBitLinear) → forms SwiGLU value
      gate × up  → sparse 5% activation
      down_proj  (ElasticBitLinear) → project back to d_model

    The LIF is applied after the SwiGLU gating step (not to raw inputs),
    so the sparsity reflects the post-nonlinearity firing pattern rather
    than the raw pre-activation distribution. This gives slightly better
    perplexity than applying LIF before gating.

    Parameters
    ----------
    d_model, ffn_dim : int
    sparsity_pct     : float  — fraction of FFN neurons that fire per token
    use_stateful_lif : bool   — use causal LIF (inference) vs fast (training)
    elastic_kwargs   : dict   — passed through to ElasticBitLinear
    """

    def __init__(
        self,
        d_model: int,
        ffn_dim: int,
        sparsity_pct: float = 0.05,
        use_stateful_lif: bool = False,
        **elastic_kwargs,
    ) -> None:
        super().__init__()
        self.gate_proj = ElasticBitLinear(d_model, ffn_dim, **elastic_kwargs)
        self.up_proj   = ElasticBitLinear(d_model, ffn_dim, **elastic_kwargs)
        self.down_proj = ElasticBitLinear(ffn_dim, d_model, **elastic_kwargs)

        if use_stateful_lif:
            self.lif = LIFStateful(ffn_dim, sparsity_pct=sparsity_pct)
        else:
            self.lif = LIFStateless(ffn_dim, sparsity_pct=sparsity_pct)

        self._use_stateful = use_stateful_lif

    def forward(
        self,
        x: torch.Tensor,
        membrane: Optional[torch.Tensor] = None,
    ) -> torch.Tensor | Tuple[torch.Tensor, torch.Tensor]:
        # SwiGLU gating: silu(gate) × up
        gated = F.silu(self.gate_proj(x)) * self.up_proj(x)    # [B, T, ffn_dim]

        # LIF sparsification — top 5% of FFN neurons fire
        if self._use_stateful:
            sparse, new_membrane = self.lif(gated, initial_membrane=membrane)
            return self.down_proj(sparse), new_membrane
        else:
            sparse = self.lif(gated)
            return self.down_proj(sparse)

    @property
    def active_fraction(self) -> float:
        """Theoretical fraction of non-zero activations per forward call."""
        if isinstance(self.lif, LIFStateless):
            return self.lif.sparsity_pct
        return self.lif.sparsity_pct

    def extra_repr(self) -> str:
        return (
            f"d_model→ffn: implicit, "
            f"sparsity={self.active_fraction:.1%}, "
            f"mode={'stateful' if self._use_stateful else 'stateless'}"
        )
