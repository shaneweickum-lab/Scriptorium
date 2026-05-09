"""
MeyvnAI Digital Biology
=======================
Six integrated modules that give the MeyvnSLM biological-inspired training
and inference properties, plus token compression and user understanding.

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

  Module 6 — Emotion Engine
      EmotionEngine: full PAD (Valence-Arousal-Dominance) emotion detection,
      session memory, hidden-state conditioning, and empathy modulation.
      EmotionState, EmotionLexicon, EmotionalMemory, EmpathyModulator.

  Module 7 — DNA Memory
      DNAMemory: persistent user-profile store that accumulates observations
      about topics, style preferences, creative triggers, sensitivities,
      emotional patterns, and vocabulary across sessions. Serialises to JSON
      for browser IndexedDB storage. Builds [DNA] context prefixes that
      condition the model's generation on who this specific user is.
      Trait: individual evidence-weighted observation record.
"""

from .elastic_stability import ElasticBitLinear
from .neuromorphic import LIFStateless, LIFStateful, SpikingFFN
from .neuro_plastic import NeuroPlasticOptimizer
from .creativity import StochasticDivergenceGovernor
from .token_compression import ActivationQuantizer, AddOnlyOps, TokenCompressor21
from .emotion_engine import (
    EmotionState,
    EmotionLexicon,
    EmotionProjector,
    EmotionalMemory,
    EmotionConditioner,
    EmpathyModulator,
    EmotionEngine,
)
from .dna_memory import Trait, DNAMemory

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
    # Module 6
    "EmotionState",
    "EmotionLexicon",
    "EmotionProjector",
    "EmotionalMemory",
    "EmotionConditioner",
    "EmpathyModulator",
    "EmotionEngine",
    # Module 7
    "Trait",
    "DNAMemory",
]
