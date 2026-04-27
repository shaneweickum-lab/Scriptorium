"""
MeyvnSLM — BitLinear 1.58-bit (Ternary) Layer
==============================================
Implements BitNet b1.58 quantization-aware training for MeyvnSLM-75M.

Every nn.Linear projection in the Transformer is replaced by BitLinear.
Shadow weights live in bfloat16 and are updated by AdamW normally.
Ternary weights {-1, 0, +1} are produced fresh each forward call via a
Straight-Through Estimator (STE), so gradients always flow to the shadow
weights without any discrete discontinuity in the backward graph.

On Apple Silicon (MPS backend):
  - Ternary values are stored as bf16 {-1.0, 0.0, 1.0} — Metal handles
    bf16 GEMM natively; no int8 kernel gap to work around.
  - Per-token activation scales are computed in bf16 (rsqrt/abs are MPS-safe).
  - Avoid .to(torch.int8) — MPS lacks int8 GEMM, causing CPU fallbacks.

Throughput target: ≥5.5k tok/s at inference on M5 Pro (bf16, batch=1).
  With 75M × 0.5 bytes effective weight (≈38 MB packed), M5 Pro's
  350–400 GB/s bandwidth yields ~9k tok/s theoretical ceiling.

References:
  Ma et al. (2024) "The Era of 1-bit LLMs: All Large Language Models are
  in 1.58 Bits" https://arxiv.org/abs/2402.17764
"""

from __future__ import annotations

import torch
import torch.nn as nn
import torch.nn.functional as F
from typing import Optional, Tuple


# ── Quantization primitives ────────────────────────────────────────────────────


class _TernaryQuantizeSTE(torch.autograd.Function):
    """
    Ternary weight quantization with Straight-Through Estimator.

    Forward
    -------
      γ  = mean(|W|)                          AbsMean of the weight matrix
      W̃  = round(clamp(W / γ, −1, 1))        ∈ {-1, 0, +1}

    Backward (STE)
    --------------
      ∂L/∂W_shadow  =  ∂L/∂W̃               Identity: gradient passes straight
                                              through the round/clamp as if they
                                              were the identity map.

    The STE approximation means the optimizer sees clean gradients from the
    loss all the way back to the high-precision shadow weights, even though
    the actual forward values are discrete ternaries.

    Note on clamp vs tanh: clamp with round is preferred over tanh-based
    soft quantization because it produces exact {-1, 0, +1} values at every
    inference step, keeping the QAT and inference graphs identical.
    """

    @staticmethod
    def forward(
        ctx: torch.autograd.function.FunctionCtx,
        weight: torch.Tensor,
    ) -> Tuple[torch.Tensor, torch.Tensor]:
        # γ: per-tensor AbsMean scaling factor (scalar)
        gamma = weight.abs().mean().clamp(min=1e-8)
        # Round and clamp produce values in {-1, 0, +1}
        # clone() so in-place ops don't affect the autograd graph of `weight`
        w_ternary = weight.clone().div_(gamma).round_().clamp_(-1.0, 1.0)
        return w_ternary, gamma

    @staticmethod
    def backward(
        ctx: torch.autograd.function.FunctionCtx,
        grad_w_ternary: torch.Tensor,
        _grad_gamma: torch.Tensor,       # gamma is a non-differentiable stat
    ) -> Tuple[torch.Tensor, None]:
        # STE: route gradient straight back to the shadow weight
        return grad_w_ternary, None


class _AbsMaxActivationSTE(torch.autograd.Function):
    """
    Per-token absmax activation quantization (8-bit) with Straight-Through
    Estimator.

    Forward
    -------
      η  = absmax(x, dim=-1) / 127          per-token scale, shape [..., 1]
      x̃  = round(clamp(x / η, −127, 127))   integer domain ∈ [-127, 127]

    Clamping to 127 (not 128) leaves one guard value for accumulator
    overflow during the GEMM, matching CUDA int8 tensor-core convention.

    Backward (STE)
    --------------
      ∂L/∂x  =  ∂L/∂x̃                     Identity through the quantizer.

    On MPS the result stays in bf16 (not converted to torch.int8), so
    F.linear operates on a bf16 matrix whose values happen to be integers.
    This trades some compute efficiency for full MPS kernel compatibility.
    """

    @staticmethod
    def forward(
        ctx: torch.autograd.function.FunctionCtx,
        x: torch.Tensor,
    ) -> Tuple[torch.Tensor, torch.Tensor]:
        # Per-token (per-row) scale: shape is [..., 1]
        eta = x.abs().amax(dim=-1, keepdim=True).clamp(min=1e-8).div_(127.0)
        x_quant = x.clone().div_(eta).round_().clamp_(-127.0, 127.0)
        return x_quant, eta

    @staticmethod
    def backward(
        ctx: torch.autograd.function.FunctionCtx,
        grad_x_quant: torch.Tensor,
        _grad_eta: torch.Tensor,
    ) -> Tuple[torch.Tensor, None]:
        # STE: route gradient straight back to the pre-quantization activation
        return grad_x_quant, None


# ── Modules ────────────────────────────────────────────────────────────────────


class MeyvnRMSNorm(nn.Module):
    """
    Root Mean Square Layer Normalization (RMSNorm).

    RMSNorm omits mean-centering relative to LayerNorm, which is both
    faster and numerically preferable before activation quantization: a
    zero-mean input wastes half the [-127, 127] quantization range, while
    RMSNorm keeps the distribution centred without forcing a mean shift.

    Place one MeyvnRMSNorm immediately before each BitLinear projection
    (or keep the existing pre-norm block structure — the norm that wraps
    each attention / FFN sub-layer already satisfies this requirement).

    Parameters
    ----------
    dim : int
        Feature dimension (d_model).
    eps : float
        Numerical stability epsilon. 1e-8 is tighter than RMSNorm's
        typical 1e-6 to prevent near-zero RMS from amplifying noise.
    """

    def __init__(self, dim: int, eps: float = 1e-8) -> None:
        super().__init__()
        self.eps = eps
        self.weight = nn.Parameter(torch.ones(dim))   # learnable scale γ

    def forward(self, x: torch.Tensor) -> torch.Tensor:
        # Compute inverse RMS; multiply by learnable scale
        rms_inv = x.pow(2).mean(dim=-1, keepdim=True).add(self.eps).rsqrt()
        return x * rms_inv * self.weight

    def extra_repr(self) -> str:
        return f"dim={self.weight.shape[0]}, eps={self.eps}"


class BitLinear(nn.Module):
    """
    MeyvnSLM BitLinear — 1.58-bit (ternary) quantized linear projection.

    Replaces every ``nn.Linear`` in the MeyvnSLM-75M Transformer blocks.
    The embedding table and LM head are left in full precision because
    vocabulary projection quality is particularly sensitive to quantization.

    Forward pass (training and inference)
    ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
    ::

        [Input x: bf16]
            │
            ▼ (caller: MeyvnRMSNorm applied upstream in TransformerBlock)
        ┌─────────────────────────────────────────────────────────┐
        │  Step 1 — Ternary weight quantization (STE)             │
        │    γ       = mean(|W_shadow|)                           │
        │    W_tern  = round(clamp(W_shadow / γ, −1, 1))         │
        │    ↑ discrete ternary; backward treated as identity     │
        ├─────────────────────────────────────────────────────────┤
        │  Step 2 — Per-token 8-bit activation quantization (STE) │
        │    η    = absmax(x, dim=-1) / 127    [per-token scale]  │
        │    x̃    = round(clamp(x / η, −127, 127))               │
        │    ↑ integer-domain bf16; backward treated as identity  │
        ├─────────────────────────────────────────────────────────┤
        │  Step 3 — Linear projection (bf16 GEMM on MPS/CUDA)    │
        │    y_raw = F.linear(x̃, W_tern)                          │
        ├─────────────────────────────────────────────────────────┤
        │  Step 4 — Rescale to real activation space              │
        │    y = y_raw × η × γ                                    │
        └─────────────────────────────────────────────────────────┘
            │
            ▼ [Output y: bf16]

    Gradient flow
    ~~~~~~~~~~~~~
    Both quantizers apply the STE, so during backpropagation:
      - ∂L/∂W_shadow  receives the gradient that would have gone to W_tern
      - ∂L/∂x         receives the gradient that would have gone to x̃
    AdamW then updates W_shadow in bf16 — ternaries are never stored.

    Apple Silicon notes
    ~~~~~~~~~~~~~~~~~~~
    MPS does not expose int8 GEMM kernels to PyTorch (as of PyTorch 2.3).
    Keeping x̃ and W_tern as bf16 tensors routes the matmul through Metal's
    bf16 GEMM path, which is fully supported and hardware-accelerated.
    The values *happen* to be integers/ternaries, but Metal doesn't care —
    it operates on the bit patterns. No CPU fallback occurs.

    Parameters
    ----------
    in_features, out_features : int
        Standard Linear dimensions.
    bias : bool
        BitNet convention omits bias terms (default False). Bias adds
        full-precision parameters that cannot be ternarized, and in
        practice does not improve perplexity at this scale.
    device, dtype : optional
        Device and dtype for shadow weights. Default dtype is bfloat16.
    """

    def __init__(
        self,
        in_features: int,
        out_features: int,
        bias: bool = False,
        device: Optional[torch.device] = None,
        dtype: torch.dtype = torch.bfloat16,
    ) -> None:
        super().__init__()
        self.in_features  = in_features
        self.out_features = out_features

        # High-precision shadow weights — these are the only persistent params.
        # Ternary weights are ephemerally computed in forward(); never saved.
        self.weight = nn.Parameter(
            torch.empty(out_features, in_features, device=device, dtype=dtype)
        )
        if bias:
            self.bias = nn.Parameter(
                torch.zeros(out_features, device=device, dtype=dtype)
            )
        else:
            self.register_parameter("bias", None)

        self._init_weights()

    # ── Initialization ─────────────────────────────────────────────────────────

    def _init_weights(self) -> None:
        """
        Truncated-normal initialization in a tight range around zero.

        Standard σ=0.02 puts most weight mass well within ±1, so after
        dividing by γ (≈0.01–0.02 at init) the ternary threshold lands
        near the median of the distribution. This ensures a healthy mix
        of −1, 0, +1 from step 1 and avoids the "all-zero collapse" that
        occurs if σ is too small (all weights below threshold → W̃ = 0).

        The truncation bounds a=−0.04, b=0.04 (±2σ) prevent outliers from
        inflating γ and pushing too many weights to zero at initialization.
        """
        nn.init.trunc_normal_(self.weight, mean=0.0, std=0.02, a=-0.04, b=0.04)

    # ── Quantizers ─────────────────────────────────────────────────────────────

    def _quantize_weights(self) -> Tuple[torch.Tensor, torch.Tensor]:
        """
        Produce ternary weights via STE.

        Returns
        -------
        w_ternary : Tensor, same shape as self.weight
            Values ∈ {-1.0, 0.0, +1.0} in bf16.
        gamma : scalar Tensor
            AbsMean of the shadow weight matrix.
        """
        return _TernaryQuantizeSTE.apply(self.weight)

    def _quantize_activations(
        self, x: torch.Tensor
    ) -> Tuple[torch.Tensor, torch.Tensor]:
        """
        Per-token 8-bit activation quantization via STE.

        Returns
        -------
        x_quant : Tensor, same shape as x
            Values ∈ [-127, 127] in bf16 (integer-valued, not cast to int8).
        eta : Tensor, shape [..., 1]
            Per-token scale factor (absmax / 127).
        """
        return _AbsMaxActivationSTE.apply(x)

    # ── Forward ────────────────────────────────────────────────────────────────

    def forward(self, x: torch.Tensor) -> torch.Tensor:
        """
        1.58-bit quantized forward pass.

        Args
        ----
        x : Tensor [..., in_features]
            Pre-normalized activations. The caller (TransformerBlock) must
            apply MeyvnRMSNorm before passing x here.

        Returns
        -------
        Tensor [..., out_features], same dtype as x.
        """
        original_dtype = x.dtype

        # Promote fp16 → bf16 for quantization stability on MPS.
        # fp16 has a small dynamic range (max ≈6.5×10⁴) that can cause
        # per-token scale overflow on rare long-tail activations.
        if x.dtype == torch.float16:
            x = x.to(torch.bfloat16)

        # ── Step 1: Ternary weight quantization ────────────────────────────────
        # w_ternary ∈ {-1.0, 0.0, +1.0}, gamma is a scalar
        w_ternary, gamma = self._quantize_weights()

        # ── Step 2: Per-token 8-bit activation quantization ───────────────────
        # x_quant ∈ [-127, 127] (bf16), eta is [..., 1]
        x_quant, eta = self._quantize_activations(x)

        # ── Step 3: Projection via bf16 GEMM ──────────────────────────────────
        # On MPS: dispatches to Metal bf16 matmul — no int8 kernel needed.
        # On CUDA Ampere+: bf16 tensor cores fire here.
        y = F.linear(x_quant, w_ternary, self.bias)

        # ── Step 4: Rescale to real activation space ──────────────────────────
        # y_raw ≈ (x / eta) @ (W_shadow / gamma)^T
        # Multiply by eta and gamma to recover the real-valued output.
        y = y * eta * gamma

        return y.to(original_dtype)

    # ── Diagnostics ────────────────────────────────────────────────────────────

    @torch.no_grad()
    def weight_stats(self) -> dict:
        """
        Return a diagnostic snapshot of the shadow weight distribution.

        Call this during training to detect ternary pathologies:

        - ``zero_pct > 60%``  →  ternary collapse; reduce LR or increase σ
        - ``zero_pct < 20%``  →  too few zeros; γ is too large, check init
        - ``w_std < 0.005``   →  dying weights; check gradient flow

        Example usage in a training loop::

            if step % 500 == 0:
                for name, module in model.named_modules():
                    if isinstance(module, BitLinear):
                        stats = module.weight_stats()
                        print(f"{name}: γ={stats['gamma']:.4f}  "
                              f"0%={stats['zero_pct']:.1f}  "
                              f"std={stats['w_std']:.4f}")
        """
        w = self.weight.float()
        gamma = w.abs().mean().clamp(min=1e-8)
        w_t = (w / gamma).round_().clamp_(-1, 1)
        total = w_t.numel()
        return {
            "gamma":    gamma.item(),
            "zero_pct": (w_t == 0).sum().item() / total * 100,
            "pos_pct":  (w_t  > 0).sum().item() / total * 100,
            "neg_pct":  (w_t  < 0).sum().item() / total * 100,
            "w_std":    w.std().item(),
            "w_abs_max": w.abs().max().item(),
        }

    def extra_repr(self) -> str:
        return (
            f"in={self.in_features}, out={self.out_features}, "
            f"bias={self.bias is not None}, "
            f"dtype={self.weight.dtype}, quant=1.58-bit+int8act"
        )
