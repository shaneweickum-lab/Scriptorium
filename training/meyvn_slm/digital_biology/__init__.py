"""
MeyvnAI Digital Biology
=======================
Four integrated modules that give the MeyvnSLM biological-inspired training
and inference properties, plus a token compression layer.

  Module 1 — Elastic Stability (BitLinear v2)
      ElasticBitLinear: momentum-based γ EMA, homeostatic ternary scaling,
      addition-only inner products.

  Module 2 — Neuromorphic Spiking
      SpikingFFN, LIFStateless, LIFStateful: leaky integrate-and-fire
      activation with top-5% temporal sparsity.

  Module 3 — Neuro-Plastic Optimizer
      NeuroPlasticOptimizer: AdamW extended with per-neuron FIW adaptive LR
      and synaptic scaling.

  Module 4 — Creativity & Permission
      StochasticDivergenceGovernor: stochastic divergence sampling,
      resonance bonus, anti-mode penalty, entropy momentum, latent-space
      creative injection.

  Module 5 — Token Compression & Addition-Only Kernel
      TokenCompressor21: gated 2-to-1 adjacent-token merging.
      ActivationQuantizer: 8-bit and 4-bit per-token quantization.
      AddOnlyOps: addition-only ternary inner product kernel.
"""

from .elastic_stability import ElasticBitLinear
from .neuromorphic import LIFStateless, LIFStateful, SpikingFFN
from .neuro_plastic import NeuroPlasticOptimizer
from .creativity import StochasticDivergenceGovernor
from .token_compression import ActivationQuantizer, AddOnlyOps, TokenCompressor21

__all__ = [
    # Module 1
    "ElasticBitLinear",
    # Module 2
    "LIFStateless",
    "LIFStateful",
    "SpikingFFN",
    # Module 3
    "NeuroPlasticOptimizer",
    # Module 4
    "StochasticDivergenceGovernor",
    # Module 5
    "ActivationQuantizer",
    "AddOnlyOps",
    "TokenCompressor21",
]
