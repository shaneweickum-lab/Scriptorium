from dataclasses import dataclass, field


@dataclass
class MavenSLMConfig:
    # Vocabulary
    vocab_size: int = 32768

    # Transformer dimensions
    d_model: int = 512
    n_heads: int = 8
    n_layers: int = 10
    # SwiGLU intermediate dim. Using 3 × d_model (1536) keeps total params
    # near 50 M despite SwiGLU's three weight matrices (gate, up, down).
    ffn_dim: int = 1536

    # Sequence length
    max_seq_len: int = 2048

    # Regularisation
    dropout: float = 0.1

    # RMSNorm epsilon
    norm_eps: float = 1e-6

    # RoPE base frequency (10k is standard; increase for longer contexts)
    rope_theta: float = 10000.0

    # Gradient checkpointing (saves activations at cost of recomputation)
    gradient_checkpointing: bool = False

    def __post_init__(self) -> None:
        assert self.d_model % self.n_heads == 0, (
            f"d_model ({self.d_model}) must be divisible by n_heads ({self.n_heads})"
        )
        assert self.vocab_size > 0 and self.n_layers > 0
