from dataclasses import dataclass
import torch


@dataclass
class MeyvnSLMConfig:
    # Vocabulary
    vocab_size: int = 32768

    # Transformer dimensions — tuned for ~3.0 B unique parameters.
    #
    # Budget (weight-tied LM head adds 0 extra):
    #   Token embeddings   32768 × 2560                 =    83,886,080
    #   34× attention      4 × 2560² per layer          =   891,289,600
    #   34× SwiGLU FFN     3 × 2560 × 7680 per layer    = 2,005,401,600
    #   34× RMSNorm pairs  2 × 2560 per layer           =       174,080
    #   Final RMSNorm                                   =         2,560
    #   ─────────────────────────────────────────────────────────────────
    #   Total unique                                    = 2,980,753,920
    #                                                   ≈ 2.98 B ≈ 3.0 B
    d_model:  int = 2560
    n_heads:  int = 20       # 128-dim per head
    n_layers: int = 34
    # SwiGLU intermediate dim = 3 × d_model so the three matrices
    # (gate, up, down) keep total FFN params near the 2-matrix equivalent.
    ffn_dim:  int = 7680

    # Sequence length
    max_seq_len: int = 2048

    # Regularisation
    dropout: float = 0.1

    # RMSNorm epsilon
    norm_eps: float = 1e-8

    # RoPE base frequency
    rope_theta: float = 10000.0

    # Gradient checkpointing — essential at 3B scale to fit activation
    # memory on single-GPU hardware. Adds ~30% compute overhead.
    gradient_checkpointing: bool = True

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
