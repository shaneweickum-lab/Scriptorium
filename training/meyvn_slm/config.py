from dataclasses import dataclass
import torch


@dataclass
class MeyvnSLMConfig:
    # Vocabulary
    vocab_size: int = 32768

    # Transformer dimensions — tuned for ~100 M unique parameters.
    #
    # Budget (weight-tied LM head adds 0 extra):
    #   Token embeddings   32768 × 640                  =    20,971,520
    #   15× attention      4 × 640² per layer           =    24,576,000
    #   15× SwiGLU FFN     3 × 640 × 1920 per layer     =    55,296,000
    #   15× RMSNorm pairs  2 × 640 per layer            =        19,200
    #   Final RMSNorm                                   =           640
    #   ─────────────────────────────────────────────────────────────────
    #   Total unique                                    =   100,863,360
    #                                                   ≈ 100.8 M
    d_model:  int = 640
    n_heads:  int = 10       # 64-dim per head (standard)
    n_layers: int = 15
    # SwiGLU intermediate dim = 3 × d_model so the three matrices
    # (gate, up, down) keep total FFN params near the 2-matrix equivalent.
    ffn_dim:  int = 1920

    # Sequence length
    max_seq_len: int = 2048

    # Regularisation
    dropout: float = 0.1

    # RMSNorm epsilon
    norm_eps: float = 1e-8

    # RoPE base frequency
    rope_theta: float = 10000.0

    # Gradient checkpointing — not required at 100M scale; the full
    # activation memory fits comfortably on any modern device. Enable
    # only if running with unusually large batch sizes on constrained hardware.
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
