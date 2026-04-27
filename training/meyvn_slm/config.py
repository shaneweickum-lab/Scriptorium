from dataclasses import dataclass
import torch


@dataclass
class MeyvnSLMConfig:
    # Vocabulary
    vocab_size: int = 32768

    # Transformer dimensions — tuned for ~75 M unique parameters.
    # Budget: 32768×576 embed + 13×(4×576² attn + 3×576×1728 ffn) + norms
    #       = 18,874,368 + 17,252,352 + 38,817,792 + 15,552
    #       ≈ 74,960,064 ≈ 75.0 M (weight-tied LM head adds 0 extra)
    d_model:  int = 576
    n_heads:  int = 9        # 64-dim per head
    n_layers: int = 13
    # SwiGLU intermediate dim = 3 × d_model so the three matrices
    # (gate, up, down) keep total FFN params near the 2-matrix equivalent.
    ffn_dim:  int = 1728

    # Sequence length
    max_seq_len: int = 2048

    # Regularisation
    dropout: float = 0.1

    # RMSNorm epsilon
    norm_eps: float = 1e-8

    # RoPE base frequency
    rope_theta: float = 10000.0

    # Gradient checkpointing (saves activations at cost of recomputation)
    gradient_checkpointing: bool = False

    # ── BitLinear 1.58-bit quantization ───────────────────────────────────────
    # Set use_bitlinear=True to replace every nn.Linear projection in the
    # attention and FFN sub-layers with a BitLinear ternary layer.
    # The token embedding and LM head remain in full precision — they are
    # never ternarized (vocabulary projection is too quality-sensitive).
    use_bitlinear: bool = False

    # Shadow weight dtype for BitLinear. bfloat16 is preferred on MPS
    # (M2+) and CUDA Ampere+. Use float32 on CPU or M1.
    bitlinear_dtype: torch.dtype = torch.bfloat16

    def __post_init__(self) -> None:
        assert self.d_model % self.n_heads == 0, (
            f"d_model ({self.d_model}) must be divisible by "
            f"n_heads ({self.n_heads})"
        )
        assert self.vocab_size > 0 and self.n_layers > 0
        assert self.ffn_dim > 0 and self.max_seq_len > 0
