"""
MeyvnAI Digital Biology — Module 4: Creativity & Permission Algorithm
=====================================================================
A stochastic divergence governor that controls the balance between
calculation (convergent, most-likely) and discovery (divergent, emotionally
resonant) during inference.

Design philosophy
-----------------
Standard language model sampling optimises for the highest-probability
continuation — the "calculated" response. Creative writing requires a
different objective: finding language that carries emotional charge,
surprise, and resonance, even if it is not statistically the most
likely choice.

The governor models this as a continuous dial:
  creativity=0.0  →  near-greedy, calculation mode
  creativity=1.0  →  maximum divergence, discovery mode

Two mechanisms operate in tandem:

  1. Latent Space Entropy Injection (training-time / architecture)
       A learned "divergence direction" d ∈ ℝ^{d_model} is added to the
       hidden states before the LM head. In calculation mode d is zeroed;
       in discovery mode it is scaled by the current layer's entropy,
       steering the representation away from the high-probability attractor
       basin and toward less-visited regions of the latent space.

  2. Stochastic Divergence Sampling (inference-time)
       Logits are transformed by a combination of:
         a) Temperature scaling (higher T → flatter distribution)
         b) Entropy momentum: tracks output entropy and applies an additional
            temperature correction to maintain a target entropy window.
         c) Resonance bonus: adds −β × log p(token) to logit scores,
            boosting tokens with high self-information (surprise). In creative
            writing, surprising but coherent language carries emotional weight.
         d) Anti-mode penalty: softly penalises the single highest-scoring
            token to prevent the model from always defaulting to the local
            mode (the most common failure mode in auto-regressive generation).

"Emotional Resonance" proxy
----------------------------
Emotional resonance cannot be measured directly without a separate
sentiment/affect model. The best proxy available within a pure language
model is self-information: tokens that are surprising (low p) in the current
context carry more "news" — they expand the listener's model of the world
more than expected continuations do. Research in cognitive science links
surprise and information density to emotional engagement in narrative.

The resonance_bonus is therefore: −resonance_weight × log p(token)
weighted down near the extremes (near-zero and near-one probability)
to avoid promoting either noise or trivial high-probability tokens.

MPS notes
---------
- All operations use standard PyTorch; no custom kernels needed.
- The divergence_direction parameter lives on the model device.
- entropy_ema is a register_buffer so it survives checkpoint roundtrips.
"""

from __future__ import annotations

import math
from typing import Optional, Tuple

import torch
import torch.nn as nn
import torch.nn.functional as F


class StochasticDivergenceGovernor(nn.Module):
    """
    Creativity & Permission inference governor.

    Usage — modulating hidden states (architecture hook):
        governor = StochasticDivergenceGovernor(d_model=2560)
        # Before LM head:
        h_out = governor.modulate_latent(h, creativity=0.8)
        logits = lm_head(h_out)

    Usage — sampling (generation loop):
        next_token = governor.sample(
            logits[:, -1, :],
            creativity_mode=True,
            creativity=0.7,
        )

    Parameters
    ----------
    d_model : int
        Hidden state dimension.
    base_temperature : float
        Sampling temperature in calculation mode (creativity=0.0).
    discovery_temperature : float
        Peak temperature at full creativity (creativity=1.0).
    resonance_weight : float
        Strength of the self-information bonus. 0.3 is subtle; 1.0 is strong.
    entropy_target_low, entropy_target_high : float
        Target entropy window (nats). Outside this range the entropy momentum
        applies a corrective temperature nudge. Typical LM entropy ≈ 2–5 nats.
    entropy_momentum : float
        EMA decay for entropy tracking. 0.95 = ~20-token window.
    anti_mode_penalty : float
        Strength of the top-1 mode penalty. 0.1 is very light; 0.5 is strong.
    """

    def __init__(
        self,
        d_model: int,
        base_temperature: float    = 0.8,
        discovery_temperature: float = 1.5,
        resonance_weight: float    = 0.3,
        entropy_target_low: float  = 2.0,
        entropy_target_high: float = 4.5,
        entropy_momentum: float    = 0.95,
        anti_mode_penalty: float   = 0.15,
    ) -> None:
        super().__init__()
        self.d_model               = d_model
        self.base_temperature      = base_temperature
        self.discovery_temperature = discovery_temperature
        self.resonance_weight      = resonance_weight
        self.entropy_target_low    = entropy_target_low
        self.entropy_target_high   = entropy_target_high
        self.anti_mode_penalty     = anti_mode_penalty
        self.entropy_momentum      = entropy_momentum

        # Learned divergence direction — the "creative push" in latent space.
        # Initialised to small random values; trained to maximise diversity
        # while minimising perplexity on the instruction dataset.
        self.divergence_direction = nn.Parameter(
            torch.randn(d_model) * 0.01
        )

        # Entropy EMA buffer — tracks recent output entropy for adaptive T
        self.register_buffer("entropy_ema", torch.tensor(3.0))

    # ── Latent space modulation ────────────────────────────────────────────────

    def modulate_latent(
        self,
        hidden_states: torch.Tensor,
        creativity: float = 0.0,
    ) -> torch.Tensor:
        """
        Inject a divergence signal into hidden states before the LM head.

        In calculation mode (creativity=0): identity — no modification.
        In discovery mode (creativity>0): adds a noise term pointing in the
        learned divergence direction, scaled by the local hidden-state entropy
        and the creativity coefficient. This "nudges" the distribution toward
        the directions the model has learned are associated with diverse output.

        h_out = h + creativity × std(h) × divergence_direction_norm

        Args
        ----
        hidden_states : Tensor [..., d_model]
        creativity    : float in [0, 1]

        Returns
        -------
        Modulated hidden states, same shape and dtype.
        """
        if creativity <= 0.0:
            return hidden_states

        # Normalised divergence direction
        d = F.normalize(self.divergence_direction.to(hidden_states.dtype), dim=0)

        # Scale by per-token hidden-state standard deviation (local entropy proxy)
        std = hidden_states.std(dim=-1, keepdim=True).detach()

        # Modulation: push hidden states along the divergence direction
        injection = creativity * std * d
        return hidden_states + injection

    # ── Entropy tracking ───────────────────────────────────────────────────────

    @torch.no_grad()
    def _update_entropy(self, probs: torch.Tensor) -> float:
        """Update EMA of output entropy and return the corrective T nudge."""
        entropy = -(probs * (probs + 1e-10).log()).sum(-1).mean().item()
        self.entropy_ema.mul_(self.entropy_momentum).add_(
            torch.tensor(entropy) * (1.0 - self.entropy_momentum)
        )
        return self.entropy_ema.item()

    def _entropy_temperature_correction(self, current_entropy: float) -> float:
        """
        Adaptive temperature nudge to keep entropy in [target_low, target_high].

        If entropy is too low (repetitive output): push T up.
        If entropy is too high (incoherent output): push T down.
        """
        if current_entropy < self.entropy_target_low:
            # Under-entropy: increase T proportionally to the shortfall
            deficit = self.entropy_target_low - current_entropy
            return 1.0 + 0.1 * deficit
        elif current_entropy > self.entropy_target_high:
            # Over-entropy: decrease T proportionally to the excess
            excess = current_entropy - self.entropy_target_high
            return max(0.5, 1.0 - 0.1 * excess)
        return 1.0

    # ── Resonance bonus ───────────────────────────────────────────────────────

    @staticmethod
    def _resonance_bonus(
        logits: torch.Tensor,
        weight: float,
    ) -> torch.Tensor:
        """
        Self-information bonus: boosts surprising tokens.

        resonance = − weight × log p(token)

        Tokens with low base probability receive a positive bonus; high-prob
        tokens receive little or no boost. This is a soft version of "explore
        the least-likely continuation" — not random noise, but a principled
        shift toward information-rich tokens.

        The bonus is windowed around the middle of the probability range:
        tokens with p < 1e-4 (pure noise) or p > 0.5 (obvious choices) get
        a reduced bonus to prevent promoting either gibberish or the mode.
        """
        p = F.softmax(logits.detach(), dim=-1).clamp(1e-10, 1.0)
        log_p = p.log()

        # Window function: max resonance at p ≈ 0.01–0.1 (surprising but plausible)
        window = (1.0 - (log_p.abs() - 3.0).abs().clamp(0, 3) / 3.0).clamp(0, 1)
        return -weight * log_p * window

    # ── Anti-mode penalty ─────────────────────────────────────────────────────

    @staticmethod
    def _anti_mode_penalty(logits: torch.Tensor, strength: float) -> torch.Tensor:
        """
        Softly penalise the top-1 token to prevent mode collapse.

        Only the highest logit receives the penalty, leaving the rest of the
        distribution untouched. Strength 0.15 is barely perceptible; 0.5 can
        significantly suppress the mode.
        """
        top1_idx    = logits.argmax(dim=-1, keepdim=True)            # [B, 1]
        penalty_vec = torch.zeros_like(logits)
        penalty_vec.scatter_(-1, top1_idx, -strength)
        return penalty_vec

    # ── Sampling ─────────────────────────────────────────────────────────────

    @torch.no_grad()
    def sample(
        self,
        logits: torch.Tensor,
        creativity_mode: bool = False,
        creativity: float = 0.7,
        top_p: float = 0.9,
        top_k: int = 0,
    ) -> torch.Tensor:
        """
        Sample the next token with stochastic divergence control.

        Calculation mode (creativity_mode=False):
          Standard nucleus (top-p) sampling at base_temperature.

        Discovery mode (creativity_mode=True):
          1. Interpolated temperature between base and discovery.
          2. Resonance bonus: +info for surprising but plausible tokens.
          3. Anti-mode penalty: soft suppression of the top-1 token.
          4. Entropy momentum: corrects T if output entropy drifts.
          5. Wider nucleus (top_p nudged upward) for broader exploration.

        Args
        ----
        logits         : [B, vocab_size] — raw LM head output, last position
        creativity_mode: bool — enable discovery mode
        creativity     : float in [0, 1] — continuous creativity dial
        top_p          : float — nucleus sampling threshold (calculation mode)
        top_k          : int   — optional top-k pre-filter (0 = disabled)

        Returns
        -------
        next_token : [B, 1]  — sampled token ids
        """
        # ── Temperature ───────────────────────────────────────────────────────
        if creativity_mode:
            # Interpolate between base and discovery temperature
            temperature = (
                self.base_temperature
                + creativity * (self.discovery_temperature - self.base_temperature)
            )
        else:
            temperature = self.base_temperature

        logits = logits / max(temperature, 1e-4)

        if creativity_mode and creativity > 0.0:
            # ── Resonance bonus ───────────────────────────────────────────────
            resonance = self._resonance_bonus(logits, weight=self.resonance_weight * creativity)
            logits    = logits + resonance

            # ── Anti-mode penalty ─────────────────────────────────────────────
            if self.anti_mode_penalty > 0:
                logits = logits + self._anti_mode_penalty(
                    logits, self.anti_mode_penalty * creativity
                )

            # ── Entropy momentum correction ───────────────────────────────────
            probs        = F.softmax(logits, dim=-1)
            current_ent  = self._update_entropy(probs)
            t_correction = self._entropy_temperature_correction(current_ent)
            if abs(t_correction - 1.0) > 0.01:
                logits = logits / t_correction

            # ── Wider nucleus in discovery mode ───────────────────────────────
            effective_top_p = min(top_p + creativity * 0.08, 0.98)
        else:
            effective_top_p = top_p

        # ── Top-k pre-filter (optional) ───────────────────────────────────────
        if top_k > 0:
            k       = min(top_k, logits.size(-1))
            thresh  = logits.topk(k, dim=-1).values[:, -1:]
            logits  = logits.masked_fill(logits < thresh, float("-inf"))

        # ── Nucleus (top-p) sampling ──────────────────────────────────────────
        probs = F.softmax(logits, dim=-1)
        if effective_top_p < 1.0:
            sorted_probs, sorted_idx = torch.sort(probs, dim=-1, descending=True)
            cum_probs = sorted_probs.cumsum(dim=-1)
            # Remove tokens beyond the nucleus
            remove = (cum_probs - sorted_probs) > effective_top_p
            sorted_probs[remove] = 0.0
            # Renormalise
            sorted_probs = sorted_probs / sorted_probs.sum(dim=-1, keepdim=True).clamp(min=1e-8)
            # Sample
            sampled_idx = torch.multinomial(sorted_probs, num_samples=1)
            return sorted_idx.gather(-1, sampled_idx)

        return torch.multinomial(probs, num_samples=1)

    # ── Diagnostics ──────────────────────────────────────────────────────────

    @torch.no_grad()
    def governor_state(self) -> dict:
        """Return current state of the divergence governor."""
        return {
            "entropy_ema":             self.entropy_ema.item(),
            "divergence_dir_norm":     self.divergence_direction.norm().item(),
            "base_temperature":        self.base_temperature,
            "discovery_temperature":   self.discovery_temperature,
            "resonance_weight":        self.resonance_weight,
            "entropy_target":         (self.entropy_target_low, self.entropy_target_high),
        }

    def extra_repr(self) -> str:
        return (
            f"d_model={self.d_model}, "
            f"T_calc={self.base_temperature}, "
            f"T_discover={self.discovery_temperature}, "
            f"resonance={self.resonance_weight}"
        )
