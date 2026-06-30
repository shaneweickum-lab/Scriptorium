"""
MeyvnAI Digital Biology — Module 6: Emotion Engine
====================================================
A multi-layer system for detecting, tracking, and responding to a user's
emotional state in real time during a writing session.

Architecture overview
---------------------
Detection (two channels, blended):
  1. EmotionLexicon — fast heuristic scan of user text against a built-in
     PAD-scored word dictionary. No extra inference; ~microsecond latency.
  2. EmotionProjector — a small learned linear layer that maps the model's
     final hidden state directly to PAD coordinates. Captures emotional
     meaning that individual words miss (tone, syntax, context).

Internal representation — PAD model
  The Pleasure-Arousal-Dominance (Russell & Mehrabian, 1977) model
  represents emotion as a point in a continuous 3D space:
    Valence    [-1, +1]: negative (distressed, angry, sad) ↔ positive (joyful, inspired)
    Arousal    [-1, +1]: calm/sleepy/quiet ↔ excited/intense/energetic
    Dominance  [-1, +1]: overwhelmed/helpless/submissive ↔ in-control/confident

  Examples of writing-relevant states:
    Creative flow     : v=+0.8, a=+0.5, d=+0.7  — high creativity
    Frustrated/stuck  : v=−0.7, a=+0.6, d=−0.4  — structured support
    Sad/discouraged   : v=−0.7, a=−0.4, d=−0.5  — gentle empathy
    Excited/inspired  : v=+0.8, a=+0.8, d=+0.5  — match energy
    Anxious/confused  : v=−0.5, a=+0.7, d=−0.6  — calm and clarify
    Neutral/working   : v= 0.0, a= 0.0, d= 0.0  — default behaviour

Memory — EmotionalMemory
  Tracks the session's rolling PAD state via an exponential moving average
  (momentum 0.65 ≈ 3-turn window). A small baseline decay (0.04/turn)
  prevents emotional lock-in — the system drifts toward neutral if the
  user's tone normalises. Escalation detection flags sudden valence drops
  (e.g. user goes from content to distressed in one turn).

Effect on generation — four mechanisms:
  1. Creativity dial (StochasticDivergenceGovernor)
       Positive/excited state → higher creativity, broader exploration.
       Negative/distressed → lower creativity, more structured responses.

  2. Resonance weight (empathy warmth)
       Distressed/helpless → high resonance (warm, affirming language).
       Excited/confident   → lower resonance (match energy, not smother).

  3. Temperature bias
       Positive + high arousal → slight temperature increase (match energy).
       Negative + high arousal → temperature decrease (calm, focused).

  4. Hidden-state conditioning (EmotionConditioner)
       A learned PAD→d_model embedding is added to the hidden states before
       generation, softly steering the model's internal representation
       toward an emotionally appropriate response register. The gate
       parameter initialises at 0 (zero effect) and grows during fine-tuning.

Lexicon design
--------------
~130 writing-context words, each with hand-crafted (v, a, d) scores.
Covers: joy/excitement, satisfaction, frustration, distress/anxiety,
sadness/fatigue, confusion, high/low dominance, and writing-specific
signals (flow, blocked, masterpiece, rubbish, etc.).

Negation handling: "not happy" correctly inverts valence (with 0.6 damping
because natural-language negation is imprecise — "not terrible" ≠ "great").

MPS / training notes
--------------------
- All nn.Module components are MPS-safe.
- EmotionalMemory uses register_buffer so session state survives checkpoint.
- EmotionConditioner gate starts at 0 — no effect at init, no instability.
- EmotionProjector can be frozen during pre-training and fine-tuned on
  dialogue data where ground-truth emotion labels are available.
"""

from __future__ import annotations

import re
from dataclasses import dataclass, field
from typing import Dict, Optional, Tuple

import torch
import torch.nn as nn
import torch.nn.functional as F


# ── PAD Emotion State ─────────────────────────────────────────────────────────


@dataclass
class EmotionState:
    """
    Pleasure-Arousal-Dominance emotion representation.

    All dimensions are continuous in [-1, +1].
    confidence ∈ [0, 1] reflects detection reliability — higher = more signal.
    """
    valence:    float = 0.0   # negative ↔ positive affect
    arousal:    float = 0.0   # calm/tired ↔ excited/intense
    dominance:  float = 0.0   # overwhelmed/helpless ↔ in-control/confident
    confidence: float = 0.0   # detection confidence

    def to_tensor(
        self,
        device: Optional[torch.device] = None,
        dtype: Optional[torch.dtype] = None,
    ) -> torch.Tensor:
        t = torch.tensor([self.valence, self.arousal, self.dominance])
        if device is not None:
            t = t.to(device)
        if dtype is not None:
            t = t.to(dtype)
        return t

    @classmethod
    def from_tensor(cls, t: torch.Tensor, confidence: float = 1.0) -> "EmotionState":
        vals = t.float().tolist()
        return cls(
            valence=float(vals[0]),
            arousal=float(vals[1]),
            dominance=float(vals[2]),
            confidence=float(confidence),
        )

    @property
    def label(self) -> str:
        """Best-match human-readable emotion label."""
        v, a, d = self.valence, self.arousal, self.dominance
        if v > 0.5 and a > 0.5:
            return "excited / inspired"
        if v > 0.5 and a <= 0.0:
            return "content / satisfied"
        if v > 0.2:
            return "positive / hopeful"
        if v < -0.5 and a > 0.5 and d < -0.3:
            return "distressed / overwhelmed"
        if v < -0.5 and a > 0.3:
            return "frustrated / angry"
        if v < -0.5 and a <= -0.2:
            return "sad / discouraged"
        if v < -0.3 and d < -0.5:
            return "helpless / stuck"
        if a > 0.5 and d < -0.4:
            return "anxious / confused"
        if d > 0.6 and v > 0.0:
            return "confident / focused"
        if abs(v) < 0.2 and abs(a) < 0.2:
            return "neutral"
        return "mixed"

    def __repr__(self) -> str:
        return (
            f"EmotionState(v={self.valence:+.2f}, a={self.arousal:+.2f}, "
            f"d={self.dominance:+.2f}, conf={self.confidence:.2f}, "
            f"label={self.label!r})"
        )


# ── Lexical Emotion Detector ──────────────────────────────────────────────────


class EmotionLexicon:
    """
    Built-in PAD-scored writing-context emotion lexicon.

    Each entry maps a word to (valence, arousal, dominance) ∈ [-1, +1]³.
    Scores are the per-word average over all matched tokens in the input.

    Negation: words in _NEGATIONS flip valence (×−0.6) and dominance (×−0.5)
    of the immediately following emotion word. Arousal is not flipped because
    "not excited" still carries emotional intensity.
    """

    _LEXICON: Dict[str, Tuple[float, float, float]] = {
        # ── Joy / excitement ──────────────────────── (v+, a+, d+)
        "love":         (+0.90, +0.60, +0.40),
        "excited":      (+0.70, +0.90, +0.50),
        "amazing":      (+0.90, +0.70, +0.40),
        "brilliant":    (+0.80, +0.50, +0.60),
        "perfect":      (+0.90, +0.30, +0.70),
        "fantastic":    (+0.90, +0.70, +0.50),
        "incredible":   (+0.80, +0.70, +0.40),
        "wonderful":    (+0.90, +0.40, +0.50),
        "thrilled":     (+0.80, +0.90, +0.50),
        "inspired":     (+0.80, +0.70, +0.60),
        "euphoric":     (+0.90, +0.90, +0.60),
        "passionate":   (+0.70, +0.80, +0.70),
        "eager":        (+0.70, +0.70, +0.50),
        "enthusiastic": (+0.80, +0.80, +0.60),
        "energized":    (+0.70, +0.80, +0.60),
        "flowing":      (+0.70, +0.40, +0.70),
        "delighted":    (+0.90, +0.70, +0.50),
        "overjoyed":    (+0.90, +0.80, +0.50),
        "pumped":       (+0.70, +0.90, +0.60),
        "masterpiece":  (+0.90, +0.70, +0.80),
        "magical":      (+0.80, +0.60, +0.40),
        "alive":        (+0.70, +0.70, +0.50),

        # ── Satisfaction / contentment ────────────── (v+, a0/-, d+)
        "good":         (+0.60,  0.00, +0.30),
        "nice":         (+0.50,  0.00, +0.20),
        "happy":        (+0.80, +0.30, +0.40),
        "content":      (+0.60, -0.30, +0.40),
        "satisfied":    (+0.60, -0.20, +0.50),
        "comfortable":  (+0.50, -0.30, +0.30),
        "calm":         (+0.30, -0.60, +0.40),
        "peaceful":     (+0.50, -0.50, +0.30),
        "pleasant":     (+0.60,  0.00, +0.30),
        "fine":         (+0.30, -0.10, +0.30),
        "glad":         (+0.70, +0.20, +0.30),
        "serene":       (+0.60, -0.60, +0.40),
        "relaxed":      (+0.40, -0.50, +0.30),
        "great":        (+0.80, +0.30, +0.50),
        "beautiful":    (+0.90, +0.40, +0.40),
        "interesting":  (+0.50, +0.30, +0.30),
        "proud":        (+0.70, +0.40, +0.80),
        "hopeful":      (+0.60, +0.30, +0.40),
        "grateful":     (+0.70, +0.20, +0.30),
        "enjoying":     (+0.70, +0.30, +0.40),

        # ── Frustration / anger ───────────────────── (v-, a+, d±)
        "frustrated":   (-0.70, +0.70, -0.30),
        "stuck":        (-0.60, +0.50, -0.50),
        "hate":         (-0.90, +0.70, +0.30),
        "terrible":     (-0.80, +0.50, -0.20),
        "awful":        (-0.80, +0.50, -0.20),
        "annoyed":      (-0.60, +0.60, -0.10),
        "angry":        (-0.80, +0.90, +0.30),
        "furious":      (-0.90, +0.90, +0.40),
        "blocked":      (-0.60, +0.40, -0.50),
        "struggling":   (-0.60, +0.60, -0.40),
        "horrible":     (-0.90, +0.50, -0.20),
        "worst":        (-0.90, +0.50, -0.20),
        "rubbish":      (-0.70, +0.40, -0.20),
        "garbage":      (-0.70, +0.40, -0.20),
        "useless":      (-0.70, +0.40, -0.40),
        "disgusting":   (-0.80, +0.60, -0.10),
        "ugly":         (-0.70, +0.30, -0.20),
        "wrong":        (-0.50, +0.30, -0.20),

        # ── Distress / anxiety ────────────────────── (v-, a+, d-)
        "anxious":      (-0.60, +0.80, -0.40),
        "scared":       (-0.70, +0.80, -0.50),
        "panicked":     (-0.80, +0.90, -0.60),
        "overwhelmed":  (-0.70, +0.80, -0.70),
        "stressed":     (-0.70, +0.80, -0.50),
        "desperate":    (-0.80, +0.80, -0.70),
        "terrified":    (-0.90, +0.90, -0.70),
        "worried":      (-0.60, +0.70, -0.40),
        "nervous":      (-0.50, +0.70, -0.30),
        "dread":        (-0.70, +0.70, -0.50),
        "uneasy":       (-0.50, +0.50, -0.40),
        "panicking":    (-0.80, +0.90, -0.60),
        "freaking":     (-0.60, +0.80, -0.40),

        # ── Sadness / fatigue ─────────────────────── (v-, a-, d-)
        "sad":          (-0.70, -0.30, -0.30),
        "depressed":    (-0.80, -0.50, -0.60),
        "tired":        (-0.30, -0.60, -0.20),
        "exhausted":    (-0.50, -0.70, -0.40),
        "hopeless":     (-0.80, -0.40, -0.70),
        "empty":        (-0.70, -0.40, -0.40),
        "bored":        (-0.40, -0.50, -0.10),
        "dull":         (-0.30, -0.50, -0.10),
        "numb":         (-0.50, -0.60, -0.30),
        "defeated":     (-0.80, -0.30, -0.70),
        "discouraged":  (-0.70, -0.20, -0.50),
        "unmotivated":  (-0.50, -0.50, -0.40),
        "melancholy":   (-0.50, -0.30, -0.20),
        "miserable":    (-0.80, -0.20, -0.50),
        "gloomy":       (-0.60, -0.30, -0.30),
        "disheartened": (-0.70, -0.10, -0.50),
        "burned":       (-0.60, -0.40, -0.40),  # "burned out"

        # ── Helplessness / loss of control ────────── (v-, a0, d--)
        "helpless":     (-0.70, +0.30, -0.90),
        "lost":         (-0.50, +0.10, -0.60),
        "confused":     (-0.40,  0.00, -0.50),
        "unsure":       (-0.20,  0.00, -0.40),
        "uncertain":    (-0.20, +0.10, -0.40),
        "unclear":      (-0.30,  0.00, -0.40),
        "failed":       (-0.70, +0.30, -0.50),
        "failing":      (-0.60, +0.40, -0.50),
        "failure":      (-0.70, +0.40, -0.60),
        "impossible":   (-0.60, +0.40, -0.70),
        "unable":       (-0.40, +0.20, -0.60),

        # ── Confidence / control ──────────────────── (v+, a+, d++)
        "confident":    (+0.60, +0.20, +0.90),
        "determined":   (+0.50, +0.50, +0.90),
        "certain":      (+0.30, +0.20, +0.90),
        "sure":         (+0.20,  0.00, +0.70),
        "focused":      (+0.40, +0.30, +0.80),
        "capable":      (+0.50, +0.20, +0.80),
        "ready":        (+0.40, +0.40, +0.70),
        "clear":        (+0.30,  0.00, +0.60),
        "know":         (+0.20,  0.00, +0.50),
        "know":         (+0.20,  0.00, +0.50),

        # ── Surprise / unexpected ─────────────────── (v0, a+, d-)
        "surprised":    (+0.30, +0.70, -0.10),
        "shocked":      (-0.20, +0.80, -0.30),
        "unexpected":   ( 0.00, +0.40, -0.20),
        "suddenly":     ( 0.00, +0.30, -0.10),
    }

    _NEGATIONS = frozenset({
        "not", "no", "never", "don't", "doesn't", "didn't",
        "can't", "cannot", "won't", "isn't", "aren't", "wasn't",
        "hardly", "barely", "scarcely",
    })

    @classmethod
    def score(cls, text: str) -> EmotionState:
        """
        Scan text and return an EmotionState from lexicon matches.

        Uses a simple unigram scan with one-token negation look-back.
        Confidence scales linearly with the number of matched emotion words,
        capped at 0.90 (full confidence requires many consistent signals).
        """
        words = re.findall(r"[a-z']+", text.lower())
        total_v = total_a = total_d = 0.0
        count = 0
        negate = False

        for word in words:
            if word in cls._NEGATIONS:
                negate = True
                continue

            if word in cls._LEXICON:
                v, a, d = cls._LEXICON[word]
                if negate:
                    v *= -0.6   # flip and dampen (negation is imprecise)
                    a *=  0.7   # arousal is harder to negate
                    d *= -0.5
                    negate = False
                total_v += v
                total_a += a
                total_d += d
                count += 1
            else:
                negate = False  # negation consumed even for unknown words

        if count == 0:
            return EmotionState(confidence=0.0)

        n = float(count)
        confidence = min(0.90, count * 0.12)
        return EmotionState(
            valence=max(-1.0, min(1.0, total_v / n)),
            arousal=max(-1.0, min(1.0, total_a / n)),
            dominance=max(-1.0, min(1.0, total_d / n)),
            confidence=confidence,
        )


# ── Learned Hidden-State → PAD Projector ──────────────────────────────────────


class EmotionProjector(nn.Module):
    """
    Learned linear projection from model hidden states to PAD coordinates.

    Maps the last-layer hidden representation (pooled over the sequence) to
    a 3D emotion vector in [-1, +1]³ via a linear layer + tanh activation.

    This layer can be:
      - Left frozen during pre-training (random, near-zero output).
      - Fine-tuned on dialogue data with emotion labels to learn rich
        contextual detection that the lexicon alone cannot provide.

    Parameters
    ----------
    d_model : int
        Hidden state dimension (must match the language model).
    """

    def __init__(self, d_model: int) -> None:
        super().__init__()
        # Initialise near zero — projector starts neutral, grows with training
        self.proj = nn.Linear(d_model, 3)
        nn.init.normal_(self.proj.weight, std=0.005)
        nn.init.zeros_(self.proj.bias)

    def forward(self, hidden_states: torch.Tensor) -> torch.Tensor:
        """
        Args
        ----
        hidden_states : [B, T, d_model]  or  [B, d_model]
            Last-layer hidden states. If 3D, mean-pooled over the T dimension.

        Returns
        -------
        pad : [B, 3]  — PAD coordinates in [-1, +1]³
        """
        if hidden_states.dim() == 3:
            h = hidden_states.mean(dim=1)
        else:
            h = hidden_states
        return torch.tanh(self.proj(h.float()))


# ── Conversation Emotional Memory ─────────────────────────────────────────────


class EmotionalMemory(nn.Module):
    """
    EMA-based conversation emotional state tracker.

    Maintains a rolling PAD state across the conversation via an exponential
    moving average. A small baseline_decay nudges the state toward neutral
    each turn, preventing emotional lock-in after a transient event.

    Escalation detection monitors for sudden large drops in valence — a
    useful signal for "user just went from fine to distressed."

    Parameters
    ----------
    ema_momentum : float
        Per-turn EMA decay. 0.65 ≈ 3-turn half-life.
        Lower values track moment-to-moment changes; higher values smooth
        across the session.
    baseline_decay : float
        Per-turn fractional drift toward the neutral baseline (0,0,0).
        0.04 means state decays to 50% neutral after ~17 turns with no new signal.
    escalation_threshold : float
        Minimum valence drop in one turn to flag escalation.
    """

    def __init__(
        self,
        ema_momentum: float = 0.65,
        baseline_decay: float = 0.04,
        escalation_threshold: float = 0.35,
    ) -> None:
        super().__init__()
        self.ema_momentum = ema_momentum
        self.baseline_decay = baseline_decay
        self.escalation_threshold = escalation_threshold

        # Persistent session state — survives checkpoint roundtrips
        self.register_buffer("state",      torch.zeros(3))
        self.register_buffer("prev_state", torch.zeros(3))
        self.register_buffer("turn",       torch.tensor(0, dtype=torch.long))

    @torch.no_grad()
    def update(self, detected: EmotionState) -> EmotionState:
        """
        Incorporate a newly detected emotion into the session state.

        The weight of the new signal is modulated by its confidence:
          α = (1 − momentum) × confidence
        A low-confidence lexical scan contributes less than a high-confidence
        hidden-state detection.

        Returns
        -------
        current : EmotionState — updated session state
        """
        self.prev_state.copy_(self.state)

        alpha = (1.0 - self.ema_momentum) * max(detected.confidence, 0.05)
        detected_t = detected.to_tensor(device=self.state.device, dtype=self.state.dtype)

        # EMA update then baseline drift
        self.state.mul_(self.ema_momentum).add_(detected_t * alpha)
        self.state.mul_(1.0 - self.baseline_decay)
        self.state.clamp_(-1.0, 1.0)

        self.turn.add_(1)

        return EmotionState.from_tensor(self.state, confidence=min(1.0, detected.confidence))

    @property
    def is_escalating(self) -> bool:
        """
        True if valence dropped sharply since the previous turn.
        Signals a transition from a neutral or positive state to distress.
        """
        drop = float(self.prev_state[0]) - float(self.state[0])
        return drop > self.escalation_threshold

    def reset(self) -> None:
        """Reset all session state for a new conversation."""
        self.state.zero_()
        self.prev_state.zero_()
        self.turn.zero_()

    def session_summary(self) -> dict:
        """Current session diagnostics."""
        v, a, d = self.state.tolist()
        es = EmotionState(v, a, d, confidence=1.0)
        return {
            "turn":       int(self.turn.item()),
            "valence":    round(v, 3),
            "arousal":    round(a, 3),
            "dominance":  round(d, 3),
            "label":      es.label,
            "escalating": self.is_escalating,
        }


# ── Hidden-State Emotion Conditioner ─────────────────────────────────────────


class EmotionConditioner(nn.Module):
    """
    Injects a PAD emotion embedding into the model's hidden states.

    Architecture:
      emotion (3,) → MLP → embedding (d_model,)
      hidden_out = hidden_in + tanh(gate) × embedding

    The gate scalar parameter starts at 0 → tanh(0) = 0 → zero injection.
    As training proceeds, the gate grows to the level that is useful for the
    task, self-limiting via tanh to ±1 of the embedding magnitude. This
    prevents instability at initialisation while allowing the conditioner to
    learn an arbitrary blend strength.

    The MLP has a bottleneck at d_model//4 to keep parameter count small.
    For d_model=640: 3→160→640 — about 103k extra parameters total.
    """

    def __init__(self, d_model: int) -> None:
        super().__init__()
        self.mlp = nn.Sequential(
            nn.Linear(3, d_model // 4),
            nn.SiLU(),
            nn.Linear(d_model // 4, d_model),
        )
        self.gate = nn.Parameter(torch.zeros(1))

    def forward(
        self,
        hidden_states: torch.Tensor,
        emotion: torch.Tensor,
    ) -> torch.Tensor:
        """
        Args
        ----
        hidden_states : [..., d_model]
        emotion       : [3] or [B, 3]  — PAD vector(s)

        Returns
        -------
        Conditioned hidden states, same shape and dtype as input.
        """
        gate = self.gate.tanh()
        emb = self.mlp(emotion.to(hidden_states.dtype))   # [d_model] or [B, d_model]

        if emb.dim() == 2 and hidden_states.dim() == 3:
            emb = emb.unsqueeze(1)   # [B, 1, d_model] — broadcast over sequence

        return hidden_states + gate * emb


# ── Empathy Modulator ─────────────────────────────────────────────────────────


class EmpathyModulator:
    """
    Pure-function mapping from a PAD EmotionState to generation parameter
    adjustments that are passed to StochasticDivergenceGovernor.sample().

    No learnable parameters — all logic is interpretable and hand-designed.

    Generation parameter adjustments
    ---------------------------------
    creativity      ∈ [0.10, 0.95]  — governor creativity dial
    resonance_weight∈ [0.05, 0.70]  — warmth / empathy strength
    temperature_bias∈ [−0.30, +0.30]— additive correction to base temperature
    top_p_bias      ∈ [−0.05, +0.05]— nucleus width adjustment

    Design rationale
    ----------------
    creativity:
      Positive + high arousal (flow, excitement) → high creativity (0.8–0.95).
      Negative + high arousal (frustration, distress) → structured (0.1–0.3).
      Formula: 0.5 + 0.30 × valence × (1 + 0.5 × max(arousal, 0))

    resonance_weight (empathy warmth):
      Distressed / helpless → 0.5–0.7 (warm, affirming language).
      Excited / confident → 0.1–0.2 (match energy, not smother).
      Formula: 0.3 − 0.15 × valence + 0.10 × (1 − dominance)
               + 0.10 bonus for acute distress (v < −0.5 and a > 0.4)

    temperature_bias:
      Mirrors energy level: positive + excited → +0.15; distressed → −0.15.
      Formula: 0.15 × valence × max(arousal, 0)

    top_p_bias:
      Slightly wider nucleus in positive states (room to explore);
      slightly narrower when confused/helpless (stay on track).
      Formula: 0.05 × valence − 0.02 × (1 − dominance)
    """

    @staticmethod
    def modulate(emotion: EmotionState) -> dict:
        """
        Args
        ----
        emotion : EmotionState — current session emotion (from EmotionalMemory)

        Returns
        -------
        params : dict with keys creativity, resonance_weight,
                 temperature_bias, top_p_bias
        """
        v = emotion.valence
        a = emotion.arousal
        d = emotion.dominance

        # ── Creativity ────────────────────────────────────────────────────────
        creativity = 0.5 + 0.30 * v * (1.0 + 0.5 * max(a, 0.0))
        creativity = float(min(0.95, max(0.10, creativity)))

        # ── Resonance weight ──────────────────────────────────────────────────
        resonance_weight = 0.30 - 0.15 * v + 0.10 * (1.0 - d)
        if v < -0.5 and a > 0.4:           # acute distress: add empathy bonus
            resonance_weight += 0.10
        resonance_weight = float(min(0.70, max(0.05, resonance_weight)))

        # ── Temperature bias ──────────────────────────────────────────────────
        temperature_bias = 0.15 * v * max(a, 0.0)
        temperature_bias = float(min(0.30, max(-0.30, temperature_bias)))

        # ── Nucleus width bias ────────────────────────────────────────────────
        top_p_bias = 0.05 * v - 0.02 * (1.0 - d)
        top_p_bias = float(min(0.05, max(-0.05, top_p_bias)))

        return {
            "creativity":       creativity,
            "resonance_weight": resonance_weight,
            "temperature_bias": temperature_bias,
            "top_p_bias":       top_p_bias,
        }

    @staticmethod
    def describe(params: dict) -> str:
        """Human-readable description of the modulation for diagnostics."""
        c = params["creativity"]
        r = params["resonance_weight"]
        tb = params["temperature_bias"]
        lines = []
        if c > 0.75:
            lines.append(f"high creativity ({c:.2f}) — expansive, exploratory")
        elif c < 0.35:
            lines.append(f"low creativity ({c:.2f}) — structured, supportive")
        else:
            lines.append(f"moderate creativity ({c:.2f})")
        if r > 0.50:
            lines.append(f"high warmth ({r:.2f}) — empathic, affirming tone")
        elif r < 0.15:
            lines.append(f"low warmth ({r:.2f}) — energetic, matching tone")
        if tb > 0.10:
            lines.append(f"warmer temperature (+{tb:.2f}) — matches excitement")
        elif tb < -0.10:
            lines.append(f"cooler temperature ({tb:.2f}) — calming, focused")
        return "; ".join(lines)


# ── Emotion Engine (main class) ───────────────────────────────────────────────


class EmotionEngine(nn.Module):
    """
    Complete emotion emulation system — detection, memory, conditioning,
    and empathy modulation in one module.

    Usage (per user turn)
    ---------------------
    # 1. Detect emotion from user's message (and optionally last hidden state)
    detected = engine.detect(
        text=user_message,
        hidden_states=model_hidden,    # optional, [B, T, d_model] or None
    )

    # 2. Update session memory
    session_emotion = engine.update_memory(detected)

    # 3. Condition hidden states for response generation
    hidden_conditioned = engine.condition_hidden(hidden_states, session_emotion)

    # 4. Get adjusted generation parameters
    params = engine.get_generation_params(session_emotion)
    # params: {'creativity': 0.72, 'resonance_weight': 0.38,
    #          'temperature_bias': 0.08, 'top_p_bias': 0.02}

    # 5. Apply to StochasticDivergenceGovernor
    next_token = governor.sample(
        logits,
        creativity_mode=True,
        creativity=params['creativity'],
        # resonance_weight applied inside governor if exposed as arg
    )

    # 6. Diagnostics
    print(engine.session_state())
    print(engine.describe_modulation(session_emotion))

    Parameters
    ----------
    d_model : int
        Must match the language model's hidden dimension.
    ema_momentum : float
        Passed to EmotionalMemory (per-turn EMA decay).
    baseline_decay : float
        Passed to EmotionalMemory (drift toward neutral per turn).
    """

    def __init__(
        self,
        d_model: int,
        ema_momentum: float = 0.65,
        baseline_decay: float = 0.04,
    ) -> None:
        super().__init__()
        self.d_model     = d_model
        self.projector   = EmotionProjector(d_model)
        self.memory      = EmotionalMemory(
            ema_momentum=ema_momentum,
            baseline_decay=baseline_decay,
        )
        self.conditioner = EmotionConditioner(d_model)

    # ── Detection ──────────────────────────────────────────────────────────────

    def detect(
        self,
        text: Optional[str] = None,
        hidden_states: Optional[torch.Tensor] = None,
    ) -> EmotionState:
        """
        Detect the user's current emotion using lexical scan, hidden-state
        projection, or a confidence-weighted blend of both.

        Args
        ----
        text          : str or None — raw user message (triggers lexical scan)
        hidden_states : Tensor [B, T, d_model] or [B, d_model] or None
                        Encoder/decoder last-layer hidden states for the
                        user's tokens (triggers learned projection).

        Returns
        -------
        EmotionState with blended valence/arousal/dominance and confidence.
        """
        lexical = EmotionLexicon.score(text) if text else EmotionState(confidence=0.0)

        if hidden_states is not None:
            with torch.no_grad():
                projected_t = self.projector(hidden_states)   # [B, 3]
                if projected_t.dim() > 1:
                    projected_t = projected_t.mean(dim=0)     # → [3]
            projected = EmotionState.from_tensor(projected_t.detach(), confidence=0.80)

            # Blend: lexical confidence determines the mix weight
            w = lexical.confidence
            return EmotionState(
                valence=   w * lexical.valence    + (1.0 - w) * projected.valence,
                arousal=   w * lexical.arousal    + (1.0 - w) * projected.arousal,
                dominance= w * lexical.dominance  + (1.0 - w) * projected.dominance,
                confidence=max(lexical.confidence, projected.confidence),
            )

        return lexical

    # ── Memory ─────────────────────────────────────────────────────────────────

    def update_memory(self, detected: EmotionState) -> EmotionState:
        """
        Update the session emotional memory with a detected EmotionState.
        Returns the updated rolling session state.
        """
        return self.memory.update(detected)

    # ── Hidden-state conditioning ──────────────────────────────────────────────

    def condition_hidden(
        self,
        hidden_states: torch.Tensor,
        emotion: EmotionState,
    ) -> torch.Tensor:
        """
        Inject emotion conditioning into the model's hidden states.

        Args
        ----
        hidden_states : [..., d_model]
        emotion       : EmotionState (typically the session state from memory)

        Returns
        -------
        Conditioned hidden states, same shape and dtype.
        """
        emotion_t = emotion.to_tensor(
            device=hidden_states.device,
            dtype=hidden_states.dtype,
        )
        return self.conditioner(hidden_states, emotion_t)

    # ── Generation parameter modulation ───────────────────────────────────────

    def get_generation_params(self, emotion: EmotionState) -> dict:
        """
        Return adjusted generation parameters based on the emotion state.

        Returns dict with: creativity, resonance_weight, temperature_bias,
        top_p_bias (see EmpathyModulator.modulate for full documentation).
        """
        return EmpathyModulator.modulate(emotion)

    def describe_modulation(self, emotion: EmotionState) -> str:
        """Human-readable string describing how the emotion changes generation."""
        params = EmpathyModulator.modulate(emotion)
        return f"{emotion} → {EmpathyModulator.describe(params)}"

    # ── Session management ────────────────────────────────────────────────────

    def reset_session(self) -> None:
        """Reset emotional memory for a new conversation session."""
        self.memory.reset()

    def session_state(self) -> dict:
        """Current session emotional state snapshot for diagnostics."""
        return self.memory.session_summary()

    # ── Diagnostics ──────────────────────────────────────────────────────────

    def extra_repr(self) -> str:
        return (
            f"d_model={self.d_model}, "
            f"ema_mom={self.memory.ema_momentum}, "
            f"baseline_decay={self.memory.baseline_decay}"
        )
