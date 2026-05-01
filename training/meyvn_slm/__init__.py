from .config import MeyvnSLMConfig
from .model import MeyvnSLM
from .layers import BitLinear, MeyvnRMSNorm
from . import digital_biology
from .digital_biology import (
    ElasticBitLinear,
    LIFStateless,
    LIFStateful,
    SpikingFFN,
    NeuroPlasticOptimizer,
    StochasticDivergenceGovernor,
    ActivationQuantizer,
    AddOnlyOps,
    TokenCompressor21,
)

__all__ = [
    "MeyvnSLM",
    "MeyvnSLMConfig",
    "BitLinear",
    "MeyvnRMSNorm",
    "digital_biology",
    # Digital Biology — Module 1
    "ElasticBitLinear",
    # Digital Biology — Module 2
    "LIFStateless",
    "LIFStateful",
    "SpikingFFN",
    # Digital Biology — Module 3
    "NeuroPlasticOptimizer",
    # Digital Biology — Module 4
    "StochasticDivergenceGovernor",
    # Digital Biology — Module 5
    "ActivationQuantizer",
    "AddOnlyOps",
    "TokenCompressor21",
]
