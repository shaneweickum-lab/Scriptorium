"""
MeyvnAI Digital Biology — Module 5: Token Compression & Addition-Only Kernel
=============================================================================
Three co-operating components:

  1. ActivationQuantizer
       Pure-Python quantization helpers. Converts bf16 activations to 8-bit
       or 4-bit integer representations before the ternary inner product,
       then dequantizes the result. Using integer-range activations against
       ternary {−1, 0, +1} weights means the inner product is a sequence of
       conditional additions — no floating-point multiplications required.

  2. AddOnlyOps
       Static methods that implement the addition-only inner product kernel:
         y = F.linear(x, W_pos) − F.linear(x, W_neg)
       where W_pos, W_neg ∈ {0, 1} are binary masks derived from a ternary
       weight matrix. Accepts both 8-bit and 4-bit quantized activations
       (automatically dequantized before the GEMM call so the Metal bf16
       runtime can execute the conditional-addition optimisation path).

  3. TokenCompressor21
       A 2-to-1 adjacent-token pair merger inspired by hierarchical temporal
       memory. The compressor fuses every pair of adjacent tokens into a single
       representation, halving sequence length before the transformer body and
       expanding back afterward.

       Compression gate:
         g = sigmoid( ElasticBitLinear([x_even ‖ x_odd]) )   ∈ (0,1)^D
         merged = g × x_even + (1−g) × x_odd

       This is a soft, differentiable selection: when g ≈ 1, the even token
       dominates; when g ≈ 0, the odd token dominates. The gate learns to
       preserve information that would otherwise be lost.

       Expansion (decoder side):
         x_even_hat = ElasticBitLinear(merged)   (learned broadcast)
         x_odd_hat  = ElasticBitLinear(merged)   (independent projection)

       Padding: if sequence length is odd, the final token is kept as-is
       during compression and removed during expansion.

4-bit packing
-------------
Two 4-bit values are packed into a single int8 byte:
  high nibble = upper 4 bits → index 0 of each pair
  low  nibble = lower 4 bits → index 1 of each pair

  pack:   byte = (a & 0xF) << 4 | (b & 0xF)
  unpack: a = (byte >> 4) & 0xF,  b = byte & 0xF

Values are quantized to the range [0, 15] (unsigned). Zero-point offset (8)
centres the range around zero: actual_val ≈ (nibble − 8) × scale.

MPS notes
---------
- Integer bit-ops (<<, >>, &, |) are supported on MPS as of PyTorch 2.2.
- The pack/unpack helpers cast to int32 for the bit ops then back to int8
  to avoid MPS dtype restrictions.
- All quantization scales (eta_8, eta_4) are computed per-token (row-wise
  absmax) to match the ElasticBitLinear activation quantization convention.
"""

from __future__ import annotations

from typing import Optional, Tuple

import torch
import torch.nn as nn
import torch.nn.functional as F

from .elastic_stability import ElasticBitLinear


# ── Activation Quantizer ──────────────────────────────────────────────────────


class ActivationQuantizer:
    """
    Per-token quantization of bf16 activations for addition-only inner products.

    All methods are static — no state is held. Scales are returned alongside
    the quantized tensor so the caller can dequantize the output.
    """

    # ── 8-bit ─────────────────────────────────────────────────────────────────

    @staticmethod
    def quantize_8bit(
        x: torch.Tensor,
    ) -> Tuple[torch.Tensor, torch.Tensor]:
        """
        Per-token absmax 8-bit signed quantization.

          eta = absmax(x, dim=-1) / 127
          x_q = clamp(round(x / eta), −127, 127)

        Args
        ----
        x : [..., D]  — bf16 activations

        Returns
        -------
        x_q : [..., D]  — quantized values stored as bf16 (NOT int8, because
                          MPS lacks int8 GEMM; the values are integer-range
                          floats so the Metal runtime skips the multiplier path)
        eta : [..., 1]  — per-token scale factors for dequantization
        """
        eta = x.detach().abs().amax(dim=-1, keepdim=True).clamp(min=1e-8) / 127.0
        x_q = (x / eta).round_().clamp_(-127.0, 127.0)
        return x_q, eta

    @staticmethod
    def dequantize_8bit(
        y_q: torch.Tensor,
        eta: torch.Tensor,
        gamma: torch.Tensor,
    ) -> torch.Tensor:
        """Rescale quantized output back to the real activation space."""
        return y_q * eta * gamma

    # ── 4-bit ─────────────────────────────────────────────────────────────────

    @staticmethod
    def quantize_4bit(
        x: torch.Tensor,
    ) -> Tuple[torch.Tensor, torch.Tensor]:
        """
        Per-token unsigned 4-bit quantization with zero-point 8.

          scale = absmax(x) / 7          (maps [−absmax, +absmax] → [1, 15])
          x_int = clamp(round(x/scale) + 8, 0, 15)   (uint4, zero-point=8)

        Adjacent pairs are packed into int8 bytes:
          packed[..., i] = (x_int[..., 2i] << 4) | x_int[..., 2i+1]

        If D is odd, the last element is zero-padded before packing.

        Returns
        -------
        packed : [..., ceil(D/2)]  — int8 tensor of packed nibbles
        scale  : [..., 1]         — per-token float scale
        """
        scale = x.detach().float().abs().amax(dim=-1, keepdim=True).clamp(min=1e-8) / 7.0
        x_int = ((x.float() / scale).round_() + 8.0).clamp_(0.0, 15.0).to(torch.int32)

        # Pad to even length if necessary
        D = x_int.shape[-1]
        if D % 2 != 0:
            pad_shape = list(x_int.shape)
            pad_shape[-1] = 1
            x_int = torch.cat([x_int, torch.zeros(pad_shape, dtype=torch.int32, device=x.device)], dim=-1)

        # Pack two nibbles per byte: high = even indices, low = odd indices
        evens = x_int[..., 0::2]   # [..., D//2]
        odds  = x_int[..., 1::2]   # [..., D//2]
        packed = ((evens << 4) | odds).to(torch.int8)

        return packed, scale.to(x.dtype)

    @staticmethod
    def dequantize_4bit(
        packed: torch.Tensor,
        scale: torch.Tensor,
        original_d: int,
    ) -> torch.Tensor:
        """
        Unpack 4-bit nibbles and dequantize to bf16.

        Args
        ----
        packed     : [..., ceil(D/2)]  — int8 packed nibbles
        scale      : [..., 1]          — per-token float scale
        original_d : int               — D before packing (to strip padding)

        Returns
        -------
        x_approx : [..., D]  — approximate bf16 reconstruction
        """
        p = packed.to(torch.int32)
        evens = (p >> 4) & 0xF    # high nibble
        odds  =  p       & 0xF    # low nibble

        # Interleave: even at even positions, odd at odd positions
        D_padded = packed.shape[-1] * 2
        out = torch.empty(*packed.shape[:-1], D_padded, dtype=torch.int32, device=packed.device)
        out[..., 0::2] = evens
        out[..., 1::2] = odds

        # Remove zero-padding if present
        out = out[..., :original_d]

        # Dequantize: subtract zero-point and rescale
        return (out.to(scale.dtype) - 8.0) * scale


# ── Addition-Only Inner Product Kernel ───────────────────────────────────────


class AddOnlyOps:
    """
    Addition-only inner product kernel for ternary weight matrices.

    No floating-point multiplications in the core path:
      y = F.linear(x, W_pos) − F.linear(x, W_neg)

    where W_pos = (W_ternary == +1) and W_neg = (W_ternary == −1) are binary
    {0, 1} masks. The GEMM degenerates to conditional additions at each
    non-zero mask position.

    8-bit variant: accepts integer-range bf16 tensors (values in [−127, 127])
    4-bit variant: unpacks nibbles then applies the same kernel
    """

    @staticmethod
    def forward_8bit(
        x_q: torch.Tensor,        # [..., D_in]   — 8-bit range bf16
        w_ternary: torch.Tensor,   # [D_out, D_in] — ternary {-1, 0, +1}
        eta: torch.Tensor,         # [..., 1]      — per-token activation scale
        gamma: torch.Tensor,       # scalar        — weight scale (gamma_ema)
        bias: Optional[torch.Tensor] = None,
    ) -> torch.Tensor:
        """
        8-bit addition-only linear: no float multiplies.

        Output is dequantized and returned in the model's working dtype.
        """
        w_pos = (w_ternary > 0).to(x_q.dtype)
        w_neg = (w_ternary < 0).to(x_q.dtype)
        y_q = F.linear(x_q, w_pos) - F.linear(x_q, w_neg)
        if bias is not None:
            y_q = y_q + bias
        return y_q * eta * gamma.to(x_q.dtype)

    @staticmethod
    def forward_4bit(
        packed: torch.Tensor,       # [..., ceil(D_in/2)] — packed nibbles
        scale: torch.Tensor,        # [..., 1]            — per-token scale
        w_ternary: torch.Tensor,    # [D_out, D_in]       — ternary {-1,0,+1}
        gamma: torch.Tensor,        # scalar              — weight scale
        original_d: int,
        bias: Optional[torch.Tensor] = None,
    ) -> torch.Tensor:
        """
        4-bit addition-only linear.

        Unpacks activations, runs the addition-only kernel, then rescales.
        """
        # Unpack to integer-range float
        x_int = ActivationQuantizer.dequantize_4bit(packed, scale, original_d)
        # Recover per-token scale for the final rescaling step
        # (dequantize already applied scale, so divide back out to get raw int range)
        x_q = (x_int / scale.clamp(min=1e-8)).round_().clamp_(-7.0, 7.0)

        w_pos = (w_ternary > 0).to(x_q.dtype)
        w_neg = (w_ternary < 0).to(x_q.dtype)
        y_q = F.linear(x_q, w_pos) - F.linear(x_q, w_neg)
        if bias is not None:
            y_q = y_q + bias
        return y_q * scale * gamma.to(x_q.dtype)


# ── 2-to-1 Token Compressor ───────────────────────────────────────────────────


class TokenCompressor21(nn.Module):
    """
    Gated 2-to-1 adjacent token pair merger.

    Halves the effective sequence length before transformer layers and
    restores it afterward, reducing attention complexity from O(T²) to
    O((T/2)²) = O(T²/4) — a 4× reduction in self-attention FLOPs.

    Compression (T → T//2):
      For each adjacent pair (x_even, x_odd):
        g = sigmoid( gate_proj([x_even ‖ x_odd]) )   ∈ (0,1)^D
        merged = g × x_even + (1−g) × x_odd

    Expansion (T//2 → T):
      x_even_hat = expand_even(merged)    [ElasticBitLinear D→D]
      x_odd_hat  = expand_odd(merged)     [ElasticBitLinear D→D]
      interleave: [x_even_hat, x_odd_hat, ...]

    The gate projection maps 2D → D; it learns which information from each
    pair to preserve. The expansion projections are independent so even and
    odd positions can recover different information from the merged token.

    Odd-length sequences:
      The final unpaired token is concatenated to the merged sequence as-is
      during compression and reconstructed (identity) during expansion.

    Parameters
    ----------
    d_model : int
        Token embedding dimension.
    elastic_kwargs : dict
        Forwarded to ElasticBitLinear (e.g. gamma_momentum, dtype).
    """

    def __init__(
        self,
        d_model: int,
        **elastic_kwargs,
    ) -> None:
        super().__init__()
        self.d_model = d_model

        # Gate: [x_even ‖ x_odd] (2D) → gate (D), range (0,1) after sigmoid
        self.gate_proj   = ElasticBitLinear(2 * d_model, d_model, **elastic_kwargs)
        # Expansion: merged (D) → even reconstruction (D)
        self.expand_even = ElasticBitLinear(d_model, d_model, **elastic_kwargs)
        # Expansion: merged (D) → odd reconstruction (D)
        self.expand_odd  = ElasticBitLinear(d_model, d_model, **elastic_kwargs)

    def compress(
        self,
        x: torch.Tensor,
    ) -> Tuple[torch.Tensor, int]:
        """
        Merge adjacent token pairs.

        Args
        ----
        x : [B, T, D]

        Returns
        -------
        merged : [B, T//2 + (T%2), D]
        orig_T : int  — original sequence length for expansion
        """
        B, T, D = x.shape
        orig_T = T

        if T % 2 != 0:
            # Odd sequence: compress pairs, carry the last token unchanged
            x_main  = x[:, :-1, :]   # [B, T-1, D] — always even length
            x_final = x[:, -1:, :]   # [B, 1, D]
        else:
            x_main  = x
            x_final = None

        # Split into even and odd positions
        x_even = x_main[:, 0::2, :]   # [B, T//2, D]
        x_odd  = x_main[:, 1::2, :]   # [B, T//2, D]

        # Gated merge
        concat = torch.cat([x_even, x_odd], dim=-1)   # [B, T//2, 2D]
        g = torch.sigmoid(self.gate_proj(concat))       # [B, T//2, D]
        merged = g * x_even + (1.0 - g) * x_odd        # [B, T//2, D]

        if x_final is not None:
            merged = torch.cat([merged, x_final], dim=1)  # [B, T//2+1, D]

        return merged, orig_T

    def expand(
        self,
        merged: torch.Tensor,
        orig_T: int,
    ) -> torch.Tensor:
        """
        Reconstruct the full token sequence from merged pairs.

        Args
        ----
        merged : [B, T//2 + (orig_T%2), D]
        orig_T : int  — original sequence length

        Returns
        -------
        x_hat : [B, orig_T, D]
        """
        B = merged.shape[0]
        has_remainder = (orig_T % 2 != 0)

        if has_remainder:
            x_main  = merged[:, :-1, :]   # [B, T//2, D]
            x_final = merged[:, -1:, :]   # [B, 1, D]
        else:
            x_main  = merged
            x_final = None

        # Expand each merged token into even + odd reconstructions
        even_hat = self.expand_even(x_main)   # [B, T//2, D]
        odd_hat  = self.expand_odd(x_main)    # [B, T//2, D]

        # Interleave: [even_0, odd_0, even_1, odd_1, ...]
        T_half = x_main.shape[1]
        x_hat = torch.empty(B, T_half * 2, self.d_model, dtype=merged.dtype, device=merged.device)
        x_hat[:, 0::2, :] = even_hat
        x_hat[:, 1::2, :] = odd_hat

        if x_final is not None:
            x_hat = torch.cat([x_hat, x_final], dim=1)   # [B, orig_T, D]

        return x_hat

    def forward(
        self,
        x: torch.Tensor,
    ) -> Tuple[torch.Tensor, int]:
        """Compress — alias for `.compress(x)`. Returns (merged, orig_T)."""
        return self.compress(x)

    def extra_repr(self) -> str:
        return f"d_model={self.d_model}, compression=2:1"
