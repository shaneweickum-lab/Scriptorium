"""MavenSLM — decoder-only causal transformer, ~50 M parameters.

Architecture choices:
  - RMSNorm instead of LayerNorm (faster, numerically stable)
  - Rotary Position Embeddings (RoPE) — no learned position table
  - SwiGLU FFN — better loss/compute tradeoff than ReLU/GELU at small scale
  - Weight tying between token embedding and LM head
  - F.scaled_dot_product_attention with is_causal=True (MPS-compatible,
    no Flash Attention dependency)
"""

import math
from typing import Optional, Tuple

import torch
import torch.nn as nn
import torch.nn.functional as F
from torch.utils.checkpoint import checkpoint

from .config import MavenSLMConfig


# ---------------------------------------------------------------------------
# Building blocks
# ---------------------------------------------------------------------------

class RMSNorm(nn.Module):
    def __init__(self, dim: int, eps: float = 1e-6) -> None:
        super().__init__()
        self.eps = eps
        self.weight = nn.Parameter(torch.ones(dim))

    def forward(self, x: torch.Tensor) -> torch.Tensor:
        norm = x.pow(2).mean(-1, keepdim=True).add(self.eps).rsqrt()
        return x * norm * self.weight


def precompute_rope_freqs(
    head_dim: int,
    max_seq_len: int,
    theta: float = 10000.0,
) -> Tuple[torch.Tensor, torch.Tensor]:
    """Return (cos, sin) tables of shape (max_seq_len, head_dim // 2)."""
    inv_freq = 1.0 / (theta ** (torch.arange(0, head_dim, 2).float() / head_dim))
    positions = torch.arange(max_seq_len, dtype=torch.float32)
    freqs = torch.outer(positions, inv_freq)          # (T, head_dim/2)
    return torch.cos(freqs), torch.sin(freqs)


def apply_rope(
    x: torch.Tensor,
    cos: torch.Tensor,
    sin: torch.Tensor,
) -> torch.Tensor:
    """Apply rotary embeddings to x.

    x   : (B, n_heads, T, head_dim)
    cos : (T, head_dim // 2)
    sin : (T, head_dim // 2)
    """
    half = x.shape[-1] // 2
    x1 = x[..., :half]
    x2 = x[..., half:]
    cos = cos.unsqueeze(0).unsqueeze(0)   # (1, 1, T, head_dim/2)
    sin = sin.unsqueeze(0).unsqueeze(0)
    return torch.cat([x1 * cos - x2 * sin, x1 * sin + x2 * cos], dim=-1)


class SwiGLUFFN(nn.Module):
    """SwiGLU feed-forward: down(silu(gate(x)) * up(x))."""

    def __init__(self, d_model: int, ffn_dim: int) -> None:
        super().__init__()
        self.gate_proj = nn.Linear(d_model, ffn_dim, bias=False)
        self.up_proj   = nn.Linear(d_model, ffn_dim, bias=False)
        self.down_proj = nn.Linear(ffn_dim, d_model, bias=False)

    def forward(self, x: torch.Tensor) -> torch.Tensor:
        return self.down_proj(F.silu(self.gate_proj(x)) * self.up_proj(x))


class CausalSelfAttention(nn.Module):
    def __init__(self, config: MavenSLMConfig) -> None:
        super().__init__()
        self.n_heads  = config.n_heads
        self.head_dim = config.d_model // config.n_heads
        self.d_model  = config.d_model
        self.dropout  = config.dropout

        self.q_proj   = nn.Linear(config.d_model, config.d_model, bias=False)
        self.k_proj   = nn.Linear(config.d_model, config.d_model, bias=False)
        self.v_proj   = nn.Linear(config.d_model, config.d_model, bias=False)
        self.out_proj = nn.Linear(config.d_model, config.d_model, bias=False)

    def forward(
        self,
        x: torch.Tensor,
        cos: torch.Tensor,
        sin: torch.Tensor,
    ) -> torch.Tensor:
        B, T, C = x.shape

        q = self.q_proj(x).view(B, T, self.n_heads, self.head_dim).transpose(1, 2)
        k = self.k_proj(x).view(B, T, self.n_heads, self.head_dim).transpose(1, 2)
        v = self.v_proj(x).view(B, T, self.n_heads, self.head_dim).transpose(1, 2)

        q = apply_rope(q, cos, sin)
        k = apply_rope(k, cos, sin)

        # MPS-compatible scaled dot-product attention with causal mask.
        # Falls back to math backend on MPS (no Flash Attention required).
        attn_out = F.scaled_dot_product_attention(
            q, k, v,
            dropout_p=self.dropout if self.training else 0.0,
            is_causal=True,
        )

        attn_out = attn_out.transpose(1, 2).contiguous().view(B, T, C)
        return self.out_proj(attn_out)


class TransformerBlock(nn.Module):
    def __init__(self, config: MavenSLMConfig) -> None:
        super().__init__()
        self.attn_norm = RMSNorm(config.d_model, eps=config.norm_eps)
        self.attn      = CausalSelfAttention(config)
        self.ffn_norm  = RMSNorm(config.d_model, eps=config.norm_eps)
        self.ffn       = SwiGLUFFN(config.d_model, config.ffn_dim)

    def forward(
        self,
        x: torch.Tensor,
        cos: torch.Tensor,
        sin: torch.Tensor,
    ) -> torch.Tensor:
        x = x + self.attn(self.attn_norm(x), cos, sin)
        x = x + self.ffn(self.ffn_norm(x))
        return x


# ---------------------------------------------------------------------------
# Full model
# ---------------------------------------------------------------------------

class MavenSLM(nn.Module):
    """~50 M parameter decoder-only transformer for writing assistance."""

    def __init__(self, config: MavenSLMConfig) -> None:
        super().__init__()
        self.config = config

        self.tok_emb = nn.Embedding(config.vocab_size, config.d_model)
        self.drop    = nn.Dropout(config.dropout)
        self.blocks  = nn.ModuleList(
            [TransformerBlock(config) for _ in range(config.n_layers)]
        )
        self.norm    = RMSNorm(config.d_model, eps=config.norm_eps)
        self.lm_head = nn.Linear(config.d_model, config.vocab_size, bias=False)

        # Weight tying: LM head reuses embedding matrix (saves ~16 M params)
        self.lm_head.weight = self.tok_emb.weight

        # Precompute RoPE tables once; move to device with the model
        cos, sin = precompute_rope_freqs(
            head_dim=config.d_model // config.n_heads,
            max_seq_len=config.max_seq_len,
            theta=config.rope_theta,
        )
        self.register_buffer("rope_cos", cos)
        self.register_buffer("rope_sin", sin)

        self._init_weights()

    def _init_weights(self) -> None:
        for name, p in self.named_parameters():
            if "weight" in name and p.dim() >= 2:
                nn.init.normal_(p, mean=0.0, std=0.02)
            elif "weight" in name and p.dim() == 1:
                nn.init.ones_(p)
        # Scale residual projections to keep activations stable at init
        scale = 0.02 / math.sqrt(2 * self.config.n_layers)
        for name, p in self.named_parameters():
            if name.endswith(("out_proj.weight", "down_proj.weight")):
                nn.init.normal_(p, mean=0.0, std=scale)

    def forward(
        self,
        input_ids: torch.Tensor,
        targets: Optional[torch.Tensor] = None,
    ) -> Tuple[torch.Tensor, Optional[torch.Tensor]]:
        B, T = input_ids.shape
        assert T <= self.config.max_seq_len, (
            f"Input length {T} exceeds max_seq_len {self.config.max_seq_len}"
        )

        x   = self.drop(self.tok_emb(input_ids))
        cos = self.rope_cos[:T]
        sin = self.rope_sin[:T]

        for block in self.blocks:
            if self.config.gradient_checkpointing and self.training:
                x = checkpoint(block, x, cos, sin, use_reentrant=False)
            else:
                x = block(x, cos, sin)

        x      = self.norm(x)
        logits = self.lm_head(x)

        loss = None
        if targets is not None:
            loss = F.cross_entropy(
                logits.view(-1, self.config.vocab_size),
                targets.view(-1),
                ignore_index=-1,
            )

        return logits, loss

    # ------------------------------------------------------------------
    # Utilities
    # ------------------------------------------------------------------

    def param_count(self) -> dict:
        """Return parameter counts, accounting for weight tying.

        model.parameters() deduplicates tied tensors, giving unique count.
        named_parameters(remove_duplicate=False) counts every reference,
        so the difference is exactly the tied (shared) embedding weight.
        """
        unique = sum(p.numel() for p in self.parameters())
        total_with_ties = sum(
            p.numel() for _, p in self.named_parameters(remove_duplicate=False)
        )
        return {
            "unique_params":     unique,
            "total_with_ties":   total_with_ties,
            "embedding_params":  self.tok_emb.weight.numel(),
            "tied_savings":      total_with_ties - unique,
        }

    @torch.no_grad()
    def generate(
        self,
        input_ids: torch.Tensor,
        max_new_tokens: int = 200,
        temperature: float = 0.8,
        top_k: int = 50,
        top_p: float = 0.9,
    ) -> torch.Tensor:
        """Autoregressive generation with top-k + nucleus (top-p) sampling."""
        self.eval()
        for _ in range(max_new_tokens):
            ctx     = input_ids[:, -self.config.max_seq_len:]
            logits, _ = self(ctx)
            logits  = logits[:, -1, :] / max(temperature, 1e-8)

            if top_k > 0:
                threshold = torch.topk(logits, min(top_k, logits.size(-1))).values[:, -1:]
                logits = logits.masked_fill(logits < threshold, float("-inf"))

            if top_p < 1.0:
                sorted_logits, sorted_idx = torch.sort(logits, descending=True)
                cum_probs = torch.cumsum(F.softmax(sorted_logits, dim=-1), dim=-1)
                remove = (cum_probs - F.softmax(sorted_logits, dim=-1)) > top_p
                sorted_logits[remove] = float("-inf")
                logits = torch.zeros_like(logits).scatter_(1, sorted_idx, sorted_logits)

            next_tok = torch.multinomial(F.softmax(logits, dim=-1), num_samples=1)
            input_ids = torch.cat([input_ids, next_tok], dim=1)

        return input_ids
