"""MeyvnSLM — decoder-only causal transformer, ~75 M parameters.

Architecture choices
--------------------
- RMSNorm instead of LayerNorm (faster, numerically stable pre-quantization)
- Rotary Position Embeddings (RoPE) — no learned position table
- SwiGLU FFN — better loss/compute tradeoff than ReLU/GELU at small scale
- Weight tying between token embedding and LM head
- F.scaled_dot_product_attention with is_causal=True (MPS-compatible,
  no Flash Attention dependency)
- Optional BitLinear 1.58-bit (ternary) projection layers via config
"""

import math
from typing import Optional, Tuple

import torch
import torch.nn as nn
import torch.nn.functional as F
from torch.utils.checkpoint import checkpoint

from .config import MeyvnSLMConfig
from .layers import BitLinear, MeyvnRMSNorm


# ── RoPE utilities ─────────────────────────────────────────────────────────────


def precompute_rope_freqs(
    head_dim: int,
    max_seq_len: int,
    theta: float = 10000.0,
) -> Tuple[torch.Tensor, torch.Tensor]:
    """Return (cos, sin) tables of shape (max_seq_len, head_dim // 2)."""
    inv_freq = 1.0 / (theta ** (torch.arange(0, head_dim, 2).float() / head_dim))
    positions = torch.arange(max_seq_len, dtype=torch.float32)
    freqs = torch.outer(positions, inv_freq)       # (T, head_dim/2)
    return torch.cos(freqs), torch.sin(freqs)


def apply_rope(
    x: torch.Tensor,
    cos: torch.Tensor,
    sin: torch.Tensor,
) -> torch.Tensor:
    """Apply rotary embeddings. x: (B, n_heads, T, head_dim)."""
    half = x.shape[-1] // 2
    x1, x2 = x[..., :half], x[..., half:]
    cos = cos.unsqueeze(0).unsqueeze(0)    # (1, 1, T, head_dim/2)
    sin = sin.unsqueeze(0).unsqueeze(0)
    return torch.cat([x1 * cos - x2 * sin, x1 * sin + x2 * cos], dim=-1)


# ── Building blocks ────────────────────────────────────────────────────────────


def _linear(
    in_features: int,
    out_features: int,
    config: MeyvnSLMConfig,
    device: Optional[torch.device] = None,
) -> nn.Module:
    """
    Factory that returns BitLinear or nn.Linear depending on config.

    Use this everywhere instead of nn.Linear so toggling use_bitlinear
    in the config is the only change needed to switch quantization on/off.
    The embedding table and LM head bypass this factory — they are always
    full-precision (see MeyvnSLM.__init__).
    """
    if config.use_bitlinear:
        return BitLinear(
            in_features,
            out_features,
            bias=False,
            device=device,
            dtype=config.bitlinear_dtype,
        )
    return nn.Linear(in_features, out_features, bias=False, device=device)


class SwiGLUFFN(nn.Module):
    """SwiGLU feed-forward: down(silu(gate(x)) * up(x))."""

    def __init__(self, config: MeyvnSLMConfig) -> None:
        super().__init__()
        self.gate_proj = _linear(config.d_model, config.ffn_dim, config)
        self.up_proj   = _linear(config.d_model, config.ffn_dim, config)
        self.down_proj = _linear(config.ffn_dim, config.d_model, config)

    def forward(self, x: torch.Tensor) -> torch.Tensor:
        return self.down_proj(F.silu(self.gate_proj(x)) * self.up_proj(x))


class CausalSelfAttention(nn.Module):
    def __init__(self, config: MeyvnSLMConfig) -> None:
        super().__init__()
        self.n_heads  = config.n_heads
        self.head_dim = config.d_model // config.n_heads
        self.d_model  = config.d_model
        self.dropout  = config.dropout

        self.q_proj   = _linear(config.d_model, config.d_model, config)
        self.k_proj   = _linear(config.d_model, config.d_model, config)
        self.v_proj   = _linear(config.d_model, config.d_model, config)
        self.out_proj = _linear(config.d_model, config.d_model, config)

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

        # MPS-compatible SDPA with causal mask — no Flash Attention needed.
        attn_out = F.scaled_dot_product_attention(
            q, k, v,
            dropout_p=self.dropout if self.training else 0.0,
            is_causal=True,
        )

        attn_out = attn_out.transpose(1, 2).contiguous().view(B, T, C)
        return self.out_proj(attn_out)


class TransformerBlock(nn.Module):
    def __init__(self, config: MeyvnSLMConfig) -> None:
        super().__init__()
        # MeyvnRMSNorm precedes every linear projection in both sub-layers.
        # This satisfies the BitNet b1.58 requirement of per-sublayer norm
        # before quantization, with no extra norm modules needed.
        self.attn_norm = MeyvnRMSNorm(config.d_model, eps=config.norm_eps)
        self.attn      = CausalSelfAttention(config)
        self.ffn_norm  = MeyvnRMSNorm(config.d_model, eps=config.norm_eps)
        self.ffn       = SwiGLUFFN(config)

    def forward(
        self,
        x: torch.Tensor,
        cos: torch.Tensor,
        sin: torch.Tensor,
    ) -> torch.Tensor:
        x = x + self.attn(self.attn_norm(x), cos, sin)
        x = x + self.ffn(self.ffn_norm(x))
        return x


# ── Full model ─────────────────────────────────────────────────────────────────


class MeyvnSLM(nn.Module):
    """~75 M parameter decoder-only transformer for writing assistance."""

    def __init__(self, config: MeyvnSLMConfig) -> None:
        super().__init__()
        self.config = config

        # Embedding and LM head are always full precision — excluded from
        # ternary quantization. Vocabulary projection quality degrades
        # visibly when ternarized at this vocab size.
        self.tok_emb = nn.Embedding(config.vocab_size, config.d_model)
        self.drop    = nn.Dropout(config.dropout)
        self.blocks  = nn.ModuleList(
            [TransformerBlock(config) for _ in range(config.n_layers)]
        )
        self.norm    = MeyvnRMSNorm(config.d_model, eps=config.norm_eps)
        self.lm_head = nn.Linear(config.d_model, config.vocab_size, bias=False)

        # Weight tying: LM head reuses the embedding matrix (saves ~18 M params)
        self.lm_head.weight = self.tok_emb.weight

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
            if p.dim() >= 2 and "weight" in name:
                nn.init.normal_(p, mean=0.0, std=0.02)
            elif p.dim() == 1 and "weight" in name:
                nn.init.ones_(p)
        # Scale residual projections to keep activations stable at init.
        # Scaled init from GPT-2: std = 0.02 / sqrt(2 * n_layers)
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
        assert T <= self.config.max_seq_len

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

    # ── Utilities ──────────────────────────────────────────────────────────────

    def param_count(self) -> dict:
        """Return parameter counts, accounting for weight tying."""
        unique = sum(p.numel() for p in self.parameters())
        total_with_ties = sum(
            p.numel() for _, p in self.named_parameters(remove_duplicate=False)
        )
        return {
            "unique_params":    unique,
            "total_with_ties":  total_with_ties,
            "embedding_params": self.tok_emb.weight.numel(),
            "tied_savings":     total_with_ties - unique,
            "quantized":        self.config.use_bitlinear,
        }

    def make_optimizer_groups(
        self,
        base_lr: float,
        weight_decay: float = 0.1,
        bitlinear_lr_scale: float = 0.5,
    ) -> list:
        """
        Build AdamW parameter groups with differential learning rates.

        BitLinear shadow weights use a lower LR than full-precision params.
        Quantization-aware training is sensitive to large gradient steps
        near ternary thresholds — a scaled-down LR reduces the chance of
        shadow weights "ping-ponging" across the zero threshold each step.

        Also excludes 1-D params (norms, biases) from weight decay, which
        is standard practice regardless of quantization.

        Parameters
        ----------
        base_lr : float
            Learning rate for full-precision parameters (embeddings, norms).
        weight_decay : float
            L2 regularization for 2-D+ weight matrices.
        bitlinear_lr_scale : float
            LR multiplier for BitLinear shadow weights. Default 0.5 gives
            half the base LR. Tune between 0.3–0.7 if loss is unstable.
        """
        bit_decay, bit_no_decay = [], []
        std_decay, std_no_decay = [], []

        seen = set()
        for name, param in self.named_parameters():
            if id(param) in seen:
                continue
            seen.add(id(param))

            # Detect whether this param belongs to a BitLinear layer
            is_bit = False
            parts = name.split(".")
            try:
                module = self
                for part in parts[:-1]:
                    module = getattr(module, part)
                is_bit = isinstance(module, BitLinear)
            except AttributeError:
                pass

            no_decay = param.dim() < 2   # 1-D: norms and biases
            if is_bit:
                (bit_no_decay if no_decay else bit_decay).append(param)
            else:
                (std_no_decay if no_decay else std_decay).append(param)

        groups = []
        if std_decay:
            groups.append({"params": std_decay,    "lr": base_lr,
                           "weight_decay": weight_decay})
        if std_no_decay:
            groups.append({"params": std_no_decay, "lr": base_lr,
                           "weight_decay": 0.0})
        if bit_decay:
            groups.append({"params": bit_decay,
                           "lr": base_lr * bitlinear_lr_scale,
                           "weight_decay": weight_decay})
        if bit_no_decay:
            groups.append({"params": bit_no_decay,
                           "lr": base_lr * bitlinear_lr_scale,
                           "weight_decay": 0.0})
        return groups

    @torch.no_grad()
    def ternary_health_check(self) -> dict:
        """
        Scan all BitLinear layers and return ternary distribution stats.

        Returns a dict keyed by layer name. Log every ~500 steps.
        Healthy distributions: zero_pct 25–55%, w_std 0.01–0.05.

        Example::

            if step % 500 == 0 and config.use_bitlinear:
                health = model.ternary_health_check()
                for layer, stats in health.items():
                    print(f"{layer}: γ={stats['gamma']:.4f}  "
                          f"0%={stats['zero_pct']:.1f}  "
                          f"±%={stats['pos_pct']:.1f}/{stats['neg_pct']:.1f}")
        """
        report = {}
        for name, module in self.named_modules():
            if isinstance(module, BitLinear):
                report[name] = module.weight_stats()
        return report

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
            ctx       = input_ids[:, -self.config.max_seq_len:]
            logits, _ = self(ctx)
            logits    = logits[:, -1, :] / max(temperature, 1e-8)

            if top_k > 0:
                thresh = torch.topk(logits, min(top_k, logits.size(-1))).values[:, -1:]
                logits = logits.masked_fill(logits < thresh, float("-inf"))

            if top_p < 1.0:
                sorted_logits, sorted_idx = torch.sort(logits, descending=True)
                cum_probs = torch.cumsum(F.softmax(sorted_logits, dim=-1), dim=-1)
                remove    = (cum_probs - F.softmax(sorted_logits, dim=-1)) > top_p
                sorted_logits[remove] = float("-inf")
                logits = torch.zeros_like(logits).scatter_(1, sorted_idx, sorted_logits)

            next_tok  = torch.multinomial(F.softmax(logits, dim=-1), num_samples=1)
            input_ids = torch.cat([input_ids, next_tok], dim=1)

        return input_ids
