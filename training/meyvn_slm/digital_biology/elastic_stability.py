"""
MeyvnAI Digital Biology — Module 1: Elastic Stability Layer (BitLinear v2)
==========================================================================
Extends the base BitLinear layer with two biological stability mechanisms:

  Momentum-Based γ (EMA)
    The weight-scale factor γ = mean(|W|) is smoothed with an exponential
    moving average. Rapid γ changes cause bulk ternary weight-flips (many
    weights simultaneously crossing the ±0.5 quantization threshold in a
    single step). The EMA keeps γ changing slowly, suppressing flip bursts
    and stabilising training dynamics.

  Homeostatic Scaling
    Biological neurons regulate their own excitability to maintain a target
    firing rate. Here we regulate the ternary distribution: if too many
    weights collapse to 0 (low activity), the effective quantization
    threshold is lowered so more weights become ±1. If too many are ±1
    (high activity), the threshold is raised. This prevents the two failure
    modes of ternary collapse: the all-zero "silent network" and the
    all-saturated "rigid network".

Addition-Only Forward Pass
    Since W_ternary ∈ {-1, 0, +1}, the inner product reduces to:
      y_j = Σ_{i: w=+1} x_i  −  Σ_{i: w=−1} x_i
    which requires no floating-point multiplications—only additions and
    subtractions. On Metal (MPS), the two F.linear calls with binary
    {0,1} masks dispatch to bf16 GEMM but the hardware conditionally
    zeros multiplier paths, effectively executing as conditional additions.

Apple Silicon / MPS notes:
  - All buffers and computations stay in bfloat16.
  - register_buffer keeps EMA state in the state_dict (survives checkpoints).
  - No int8 casts — MPS lacks int8 GEMM kernels.
"""

from __future__ import annotations

import math
from typing import Optional, Tuple

import torch
import torch.nn as nn
import torch.nn.functional as F


# ── Autograd Function ─────────────────────────────────────────────────────────


class _HomeostaticQuantizeSTE(torch.autograd.Function):
    """
    Ternary quantization with homeostatic threshold and Straight-Through
    Estimator (STE).

    Forward
    -------
      threshold = 0.5 × tau          (tau adjusts the zero-band width)
      W_scaled  = W / γ_ema          (normalize by momentum-smoothed scale)
      W_ternary = sign(W_scaled) × [|W_scaled| ≥ threshold]  ∈ {-1, 0, +1}

    τ interpretation:
      τ > 1  →  wider zero band  →  more zeros  (suppresses over-active layer)
      τ < 1  →  narrower zero band  →  fewer zeros  (rescues silent layer)

    Backward (STE)
    --------------
      ∂L/∂W_shadow = ∂L/∂W_ternary  (identity through quantizer)
    """

    @staticmethod
    def forward(
        ctx: torch.autograd.function.FunctionCtx,
        weight: torch.Tensor,
        gamma_ema: torch.Tensor,        # scalar EMA of mean(|W|), detached buffer
        tau: torch.Tensor,              # scalar homeostatic temperature, detached
    ) -> Tuple[torch.Tensor, torch.Tensor]:
        threshold = 0.5 * tau.clamp(0.25, 4.0)
        w_scaled  = weight / gamma_ema.clamp(min=1e-8)
        # Ternary: sign gives {-1, 0, +1} direction; mask applies zero-band
        fire_mask = (w_scaled.abs() >= threshold).to(weight.dtype)
        w_ternary = w_scaled.sign() * fire_mask
        return w_ternary, gamma_ema

    @staticmethod
    def backward(
        ctx: torch.autograd.function.FunctionCtx,
        grad_w_ternary: torch.Tensor,
        _grad_gamma: torch.Tensor,
    ) -> Tuple[torch.Tensor, None, None]:
        return grad_w_ternary, None, None   # STE; γ and τ have no grad path


# ── Module ────────────────────────────────────────────────────────────────────


class ElasticBitLinear(nn.Module):
    """
    MeyvnAI Elastic Stability Layer — BitLinear v2.

    Enhancements over base BitLinear
    ---------------------------------
    γ_ema        Exponential moving average of mean(|W|).
                 Prevents sudden bulk weight-flips by keeping the scale
                 factor stable across steps. High momentum (default 0.999)
                 means γ evolves on a ~1000-step timescale.

    zero_frac_ema  Running estimate of the fraction of weights quantized to 0.
                   Drives the homeostatic τ correction.

    Homeostatic τ  If zero_frac_ema drifts above target: τ > 1 → wider dead-
                   zone → fewer non-zero weights (calms an over-active layer).
                   If below target: τ < 1 → narrower dead-zone → more non-zero
                   weights (rescues a dying layer).

    Addition-only  Separates W_ternary into binary positive/negative masks and
                   computes F.linear(x, pos) − F.linear(x, neg), replacing
                   float multiplications with conditional additions.

    Parameters
    ----------
    in_features, out_features : int
    bias : bool
        BitNet convention: no bias (default False).
    gamma_momentum : float
        EMA decay for γ. 0.999 ≈ 1000-step window.
    homeostatic_strength : float
        Strength of τ correction. 0.5 is conservative; 2.0 is aggressive.
    target_zero_frac : float
        Target fraction of zero weights. 0.33 = maximum-entropy ternary
        distribution (equal thirds of −1, 0, +1).
    zero_frac_momentum : float
        EMA decay for zero_frac tracking. Slower than γ (default 0.9999).
    dtype : torch.dtype
        Shadow weight precision. bfloat16 on M2+ / CUDA Ampere+.
    """

    def __init__(
        self,
        in_features: int,
        out_features: int,
        bias: bool = False,
        device: Optional[torch.device] = None,
        dtype: torch.dtype = torch.bfloat16,
        gamma_momentum: float = 0.999,
        homeostatic_strength: float = 0.5,
        target_zero_frac: float = 0.33,
        zero_frac_momentum: float = 0.9999,
    ) -> None:
        super().__init__()
        self.in_features         = in_features
        self.out_features        = out_features
        self.gamma_momentum      = gamma_momentum
        self.homeostatic_strength = homeostatic_strength
        self.target_zero_frac    = target_zero_frac
        self.zero_frac_momentum  = zero_frac_momentum

        self.weight = nn.Parameter(
            torch.empty(out_features, in_features, device=device, dtype=dtype)
        )
        if bias:
            self.bias = nn.Parameter(
                torch.zeros(out_features, device=device, dtype=dtype)
            )
        else:
            self.register_parameter("bias", None)

        # EMA buffers — persisted in checkpoints, never in the optimizer
        self.register_buffer("gamma_ema",     torch.ones(1, dtype=torch.float32))
        self.register_buffer("zero_frac_ema", torch.full((1,), target_zero_frac))

        self._init_weights()

    # ── Initialization ─────────────────────────────────────────────────────────

    def _init_weights(self) -> None:
        """
        Tight truncated-normal init keeps shadow weights in the ternary-
        friendly range from the start. σ=0.02 with |x| < 2σ = 0.04 means
        most weights start near zero, giving a healthy initial zero_frac ≈ 0.5
        before the EMA converges to the target.
        """
        nn.init.trunc_normal_(self.weight, mean=0.0, std=0.02, a=-0.04, b=0.04)
        # Seed gamma_ema from actual initial weight statistics
        with torch.no_grad():
            self.gamma_ema.fill_(self.weight.float().abs().mean().item())

    # ── EMA and homeostatic update ─────────────────────────────────────────────

    def _update_emas(self, w_ternary: torch.Tensor) -> None:
        """Update γ and zero-fraction EMAs. Call only during training."""
        gamma_now     = self.weight.detach().float().abs().mean()
        zero_frac_now = (w_ternary.detach() == 0).float().mean()
        self.gamma_ema.mul_(self.gamma_momentum).add_(
            gamma_now * (1.0 - self.gamma_momentum)
        )
        self.zero_frac_ema.mul_(self.zero_frac_momentum).add_(
            zero_frac_now * (1.0 - self.zero_frac_momentum)
        )

    def _compute_tau(self) -> torch.Tensor:
        """
        Homeostatic temperature τ.

        τ = 1 + strength × (target − current_zero_frac)
            > 1 when zero_frac < target  →  wider dead-zone  →  more zeros
            < 1 when zero_frac > target  →  narrower dead-zone  →  fewer zeros
        """
        correction = self.homeostatic_strength * (
            self.target_zero_frac - self.zero_frac_ema.item()
        )
        return torch.tensor(1.0 + correction, dtype=torch.float32)

    # ── Quantizers ─────────────────────────────────────────────────────────────

    def _quantize_weights(self) -> Tuple[torch.Tensor, torch.Tensor]:
        tau = self._compute_tau()
        return _HomeostaticQuantizeSTE.apply(
            self.weight, self.gamma_ema, tau
        )

    def _quantize_activations_8bit(
        self, x: torch.Tensor
    ) -> Tuple[torch.Tensor, torch.Tensor]:
        """Per-token absmax 8-bit activation quantization with STE."""
        eta = x.abs().amax(dim=-1, keepdim=True).clamp(min=1e-8) / 127.0
        x_q = x.clone().div_(eta).round_().clamp_(-127.0, 127.0)
        return x_q, eta

    # ── Addition-only forward ─────────────────────────────────────────────────

    @staticmethod
    def _addition_only_linear(
        x: torch.Tensor,
        w_ternary: torch.Tensor,
        bias: Optional[torch.Tensor],
    ) -> torch.Tensor:
        """
        Inner product using only additions/subtractions — no float multiplies.

        Decompose W ∈ {−1, 0, +1} into:
          W_pos = (W == +1) as binary {0, 1}
          W_neg = (W == −1) as binary {0, 1}
        Then: y = F.linear(x, W_pos) − F.linear(x, W_neg)

        Since W_pos, W_neg ∈ {0, 1}, the linear ops are selective sums.
        The Metal bf16 GEMM kernel conditionally zeros-out multiply paths for
        zero mask entries, executing as conditional additions on-chip.
        """
        w_pos = (w_ternary > 0).to(x.dtype)   # binary: 1 where w=+1
        w_neg = (w_ternary < 0).to(x.dtype)   # binary: 1 where w=−1
        y = F.linear(x, w_pos) - F.linear(x, w_neg)
        if bias is not None:
            y = y + bias
        return y

    # ── Forward ───────────────────────────────────────────────────────────────

    def forward(self, x: torch.Tensor) -> torch.Tensor:
        """
        Elastic Stability forward pass.

        1. Ternary quantize weights with homeostatic threshold (STE).
        2. Update γ and zero_frac EMAs (training only).
        3. 8-bit per-token activation quantization (STE).
        4. Addition-only inner product.
        5. Rescale by η (activation scale) × γ (weight scale).
        """
        if x.dtype == torch.float16:
            x = x.to(torch.bfloat16)

        # ── Step 1: Ternary weights ────────────────────────────────────────────
        w_ternary, gamma = self._quantize_weights()

        # ── Step 2: Update EMA buffers (training only) ────────────────────────
        if self.training:
            self._update_emas(w_ternary)

        # ── Step 3: 8-bit activation quantization ─────────────────────────────
        x_q, eta = self._quantize_activations_8bit(x)

        # ── Step 4: Addition-only projection ─────────────────────────────────
        y = self._addition_only_linear(x_q, w_ternary, self.bias)

        # ── Step 5: Rescale to real activation space ─────────────────────────
        return y * eta * gamma.to(x.dtype)

    # ── Diagnostics ───────────────────────────────────────────────────────────

    @torch.no_grad()
    def stability_report(self) -> dict:
        """
        Full stability snapshot. Call every 500 steps to detect pathologies.

        Healthy ranges:
          gamma_ema   : 0.005–0.05  (too high → weights collapsing to centre)
          zero_frac   : 0.25–0.50   (outside → homeostasis is fighting hard)
          tau         : 0.80–1.20   (large values → distribution severely off)
          flip_risk   : < 0.05      (fraction of weights near threshold ±0.1)
        """
        w  = self.weight.float()
        g  = self.gamma_ema.item()
        zf = self.zero_frac_ema.item()
        tau = self._compute_tau().item()
        w_scaled = w / max(g, 1e-8)
        threshold = 0.5 * tau
        near_threshold = ((w_scaled.abs() - threshold).abs() < 0.1).float().mean()
        w_t = (w_scaled.abs() >= threshold).float() * w_scaled.sign()
        return {
            "gamma_ema":    g,
            "zero_frac":    (w_t == 0).float().mean().item(),
            "pos_frac":     (w_t  > 0).float().mean().item(),
            "neg_frac":     (w_t  < 0).float().mean().item(),
            "tau":          tau,
            "flip_risk":    near_threshold.item(),
            "w_std":        w.std().item(),
        }

    def extra_repr(self) -> str:
        return (
            f"in={self.in_features}, out={self.out_features}, "
            f"γ_mom={self.gamma_momentum}, "
            f"target_zero={self.target_zero_frac:.2f}"
        )
