"""
MeyvnAI Digital Biology — Module 3: Neuro-Plastic Optimizer
============================================================
A custom AdamW-based optimizer that implements biological Synaptic Scaling
via a Frequency-Intensity Weight (FIW) adaptive learning-rate mechanism.

Biological motivation
---------------------
Synaptic scaling is a form of homeostatic plasticity: neurons globally
adjust all their synaptic strengths in response to chronic over- or
under-activity. The goal is to keep each neuron firing within a healthy
operating range — not so little that it dies, not so much that it
dominates and prevents other patterns from forming.

FIW (Frequency-Intensity Weight)
---------------------------------
For each output neuron (row of a weight matrix W):

  frequency   = EMA{ |∂L/∂w_row| > ε }  — fraction of steps with signal
  intensity   = EMA{ mean_col|∂L/∂w_row| } — average gradient magnitude

  FIW = frequency × intensity  (normalised per-layer)

FIW is high for neurons that get strong, frequent gradient signals
(hyperactive paths). It is low for neurons that rarely receive gradient
signal or always receive very weak ones (underutilised / dead paths).

Adaptive LR scaling:
  lr_scale = 1 / sqrt(FIW_norm + ε)   clamped to [min_lr_scale, max_lr_scale]
  effective_lr_for_row = base_lr × lr_scale

This inversely scales the learning rate with activity:
  hyperactive neuron → high FIW → low LR → dampens runaway learning
  dead / underused   → low  FIW → high LR → rescues the neuron

Memory footprint
----------------
FIW state is tracked per-neuron (per output row), not per weight element.
For a weight matrix of shape (D_out, D_in), only two vectors of shape (D_out,)
are stored. For the full 3B model (≈1.2M total neurons), this adds only
~10 MB of float32 state — negligible compared to the ~40 GB training peak.

FIW is only applied to 2-D+ weight matrices (attention/FFN projections).
1-D tensors (norms, biases) use standard AdamW with no FIW scaling.

MPS notes
---------
- All optimizer state tensors live on the same device as the parameters.
- No operations incompatible with MPS backend.
- Using momentum 0.999 for frequency, 0.99 for intensity gives fast
  enough response on a 3000-step pilot run but smooth enough for 114k steps.
"""

from __future__ import annotations

import math
from typing import Callable, Iterable, Optional, Tuple, Union

import torch
from torch import Tensor
from torch.optim import Optimizer


class NeuroPlasticOptimizer(Optimizer):
    """
    Synaptic Scaling AdamW with Frequency-Intensity Weight (FIW) adaptive LR.

    Drop-in replacement for AdamW. All AdamW arguments work identically;
    the FIW mechanism adds neuron-level LR adaptation on top.

    Parameters
    ----------
    params : iterable
        Model parameters or param groups.
    lr : float
        Base learning rate.
    betas : (float, float)
        Adam β₁, β₂. Defaults: (0.9, 0.95) — standard for LLM pre-training.
    eps : float
        Adam ε denominator stability term.
    weight_decay : float
        AdamW decoupled weight decay.
    fiw_freq_momentum : float
        EMA decay for gradient-frequency tracking. 0.999 = ~1000-step window.
    fiw_intensity_momentum : float
        EMA decay for gradient-intensity tracking. 0.99 = ~100-step window.
    dead_neuron_threshold : float
        |grad| below this value is treated as "no signal" for frequency tracking.
    min_lr_scale : float
        Lower bound on per-neuron LR multiplier (prevents over-stimulation).
    max_lr_scale : float
        Upper bound on per-neuron LR multiplier (limits dead-neuron rescue).
    fiw_warmup_steps : int
        Steps before FIW scaling activates. Early training statistics are
        unreliable; using them to scale LR causes instability.
    """

    def __init__(
        self,
        params: Iterable,
        lr: float = 1e-4,
        betas: Tuple[float, float] = (0.9, 0.95),
        eps: float = 1e-8,
        weight_decay: float = 0.1,
        fiw_freq_momentum: float = 0.999,
        fiw_intensity_momentum: float = 0.99,
        dead_neuron_threshold: float = 1e-7,
        min_lr_scale: float = 0.1,
        max_lr_scale: float = 10.0,
        fiw_warmup_steps: int = 500,
    ) -> None:
        if lr < 0:
            raise ValueError(f"Invalid lr: {lr}")
        if not (0.0 <= betas[0] < 1.0 and 0.0 <= betas[1] < 1.0):
            raise ValueError(f"Invalid betas: {betas}")

        defaults = dict(
            lr=lr,
            betas=betas,
            eps=eps,
            weight_decay=weight_decay,
            fiw_freq_momentum=fiw_freq_momentum,
            fiw_intensity_momentum=fiw_intensity_momentum,
            dead_neuron_threshold=dead_neuron_threshold,
            min_lr_scale=min_lr_scale,
            max_lr_scale=max_lr_scale,
            fiw_warmup_steps=fiw_warmup_steps,
        )
        super().__init__(params, defaults)

    # ── State initialisation ──────────────────────────────────────────────────

    def _init_state(self, p: Tensor, group: dict) -> dict:
        state = self.state[p]
        if len(state) == 0:
            state["step"] = 0
            # Standard Adam moments (full parameter shape)
            state["exp_avg"]    = torch.zeros_like(p, memory_format=torch.preserve_format)
            state["exp_avg_sq"] = torch.zeros_like(p, memory_format=torch.preserve_format)
            # FIW state — per-neuron (per output-row) for 2D+ params
            if p.dim() >= 2:
                n_neurons = p.shape[0]
                dev = p.device
                state["fiw_freq"]      = torch.zeros(n_neurons, device=dev, dtype=torch.float32)
                state["fiw_intensity"] = torch.zeros(n_neurons, device=dev, dtype=torch.float32)
            # else: 1D params (norms/biases) — no FIW
        return state

    # ── FIW computation ───────────────────────────────────────────────────────

    def _update_fiw(self, p: Tensor, grad: Tensor, state: dict, group: dict) -> Optional[Tensor]:
        """
        Update per-neuron FIW statistics and return per-row lr_scale tensor.
        Returns None for 1-D parameters (no FIW for norm/bias layers).
        """
        if p.dim() < 2:
            return None

        freq_mom      = group["fiw_freq_momentum"]
        intensity_mom = group["fiw_intensity_momentum"]
        dead_thresh   = group["dead_neuron_threshold"]
        lo            = group["min_lr_scale"]
        hi            = group["max_lr_scale"]

        # Per-neuron (per output-row) gradient statistics
        # grad shape: (D_out, D_in) → row-wise mean gives (D_out,)
        row_intensity = grad.detach().float().abs().mean(dim=tuple(range(1, grad.dim())))  # (D_out,)
        row_freq      = (row_intensity > dead_thresh).float()

        # EMA update
        state["fiw_freq"].mul_(freq_mom).add_(row_freq,      alpha=1.0 - freq_mom)
        state["fiw_intensity"].mul_(intensity_mom).add_(row_intensity, alpha=1.0 - intensity_mom)

        # FIW = frequency × intensity, normalised per-layer
        fiw = state["fiw_freq"] * state["fiw_intensity"]                    # (D_out,)
        fiw_norm = fiw / (fiw.mean().clamp(min=1e-8))                       # (D_out,)

        # Inverse-root scaling: high FIW → low LR, low FIW → high LR
        lr_scale = fiw_norm.pow(-0.5).clamp(lo, hi)                        # (D_out,)
        return lr_scale.to(p.dtype).unsqueeze(-1)   # (D_out, 1) — broadcasts over D_in

    # ── Step ─────────────────────────────────────────────────────────────────

    @torch.no_grad()
    def step(self, closure: Optional[Callable] = None) -> Optional[Tensor]:
        loss = None
        if closure is not None:
            with torch.enable_grad():
                loss = closure()

        for group in self.param_groups:
            beta1, beta2 = group["betas"]
            eps          = group["eps"]
            wd           = group["weight_decay"]
            warmup       = group["fiw_warmup_steps"]

            for p in group["params"]:
                if p.grad is None:
                    continue

                grad = p.grad
                if grad.is_sparse:
                    raise RuntimeError("NeuroPlasticOptimizer does not support sparse gradients")

                state = self._init_state(p, group)
                state["step"] += 1
                t = state["step"]

                exp_avg    = state["exp_avg"]
                exp_avg_sq = state["exp_avg_sq"]

                # ── Standard AdamW moments ────────────────────────────────────
                exp_avg.mul_(beta1).add_(grad, alpha=1.0 - beta1)
                exp_avg_sq.mul_(beta2).addcmul_(grad, grad, value=1.0 - beta2)

                bias_corr1 = 1.0 - beta1 ** t
                bias_corr2 = 1.0 - beta2 ** t

                denom = (exp_avg_sq.sqrt() / math.sqrt(bias_corr2)).add_(eps)

                # ── FIW adaptive LR ───────────────────────────────────────────
                lr_scale = None
                if t > warmup:
                    lr_scale = self._update_fiw(p, grad, state, group)

                step_size = group["lr"] / bias_corr1

                if lr_scale is not None:
                    # Element-wise effective LR via FIW-scaled step
                    p.addcdiv_(exp_avg * lr_scale, denom, value=-step_size)
                else:
                    p.addcdiv_(exp_avg, denom, value=-step_size)

                # ── Decoupled weight decay ─────────────────────────────────────
                if wd != 0:
                    p.mul_(1.0 - group["lr"] * wd)

        return loss

    # ── Diagnostics ──────────────────────────────────────────────────────────

    @torch.no_grad()
    def neuron_health_report(self, top_k: int = 5) -> dict:
        """
        Return per-layer neuron health metrics.

        Healthy indicators:
          mean_freq      ≈ 0.3–0.7   (most neurons active some of the time)
          dead_fraction  < 0.05      (< 5% of neurons effectively frozen)
          hyper_fraction < 0.10      (< 10% of neurons dominating gradients)
          mean_lr_scale  ≈ 1.0–2.0   (FIW correction is gentle)
        """
        report = {}
        for i, group in enumerate(self.param_groups):
            lo = group["min_lr_scale"]
            hi = group["max_lr_scale"]
            for j, p in enumerate(group["params"]):
                state = self.state.get(p, {})
                if "fiw_freq" not in state:
                    continue
                freq = state["fiw_freq"]
                intensity = state["fiw_intensity"]
                fiw = freq * intensity
                fiw_norm = fiw / fiw.mean().clamp(min=1e-8)
                lr_scale = fiw_norm.pow(-0.5).clamp(lo, hi)
                key = f"group{i}_param{j}_shape{list(p.shape)}"
                report[key] = {
                    "step":           state["step"],
                    "mean_freq":      freq.mean().item(),
                    "dead_fraction":  (freq < 0.05).float().mean().item(),
                    "hyper_fraction": (fiw_norm > 5.0).float().mean().item(),
                    "mean_lr_scale":  lr_scale.mean().item(),
                    "max_lr_scale":   lr_scale.max().item(),
                }
        return report
