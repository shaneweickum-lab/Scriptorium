"""
MeyvnAI Digital Biology — Module 7: DNA Memory
===============================================
A persistent, structured user-profile store that accumulates observations
about what a specific user cares about, responds to, and is excited by over
the course of their sessions.

The name "DNA" captures the biological metaphor: just as DNA encodes the
blueprint of an organism, this memory encodes the blueprint of the user —
their preferences, sensitivities, creative obsessions, and emotional
triggers. The model reads this blueprint before generating each response,
personalising its output without requiring a separate fine-tuning run.

Design principles
-----------------
1. Observation-driven, not user-reported.
   The system infers preferences from what the user says and how they react
   (detected via EmotionEngine), not from explicit profile questions.

2. Evidence-weighted, not binary.
   Each trait has a strength score in [0, 1] that grows with repeated
   confirmations and decays slowly with time. A trait observed once is
   held lightly; one observed thirty times is held firmly.

3. Structured, not a free-form blob.
   Observations are categorised (topics, style, tone, triggers,
   emotional patterns) so the model can selectively attend to the relevant
   category when generating.

4. Serialisable.
   The entire profile exports to a plain Python dict (JSON-compatible)
   so it can be persisted in the browser's IndexedDB alongside the book
   data and reloaded at the start of each session.

5. Privacy-first.
   The DNA store lives entirely on the user's device. Nothing is sent to
   any server. The user can inspect, edit, or delete it at any time.

Memory schema
-------------
The profile is organised into seven categories:

  topics          Things the user writes about or asks about frequently.
                  Key = normalised topic string; value = strength + evidence.

  style_prefs     Prose style preferences detected from reactions.
                  e.g. "lyrical prose", "short sentences", "dark tone".

  creative_triggers  Words/themes that reliably spike positive arousal
                  (user gets visibly excited). Prioritised in suggestions.

  sensitivities   Topics or framings that cause negative arousal / distress.
                  The model avoids these unless the user explicitly raises them.

  emotional_patterns  Recurring emotional states keyed to writing contexts.
                  e.g. "gets frustrated when stuck on dialogue".

  vocabulary      Words the user uses frequently and reacts positively to
                  when mirrored back. Helps style matching.

  meta            Session statistics: total turns observed, first/last seen,
                  session count, total unique trait observations.

Trait strength update rule
--------------------------
On each observation:
  strength_new = momentum × strength_old + (1 − momentum) × signal

where signal ∈ [0, 1] is the intensity of the observation (e.g. 1.0 for
a very excited reaction, 0.3 for a neutral mention).

momentum = 0.85 means a trait decays to 50% of its peak in ~4.3 sessions
if never re-observed. Active traits reinforce toward 1.0.

A trait with strength < prune_threshold (default 0.05) is pruned from the
profile to keep it compact.

Injection into the model
------------------------
At the start of each response generation, the top-K strongest traits per
category are serialised into a compact text block:

  [DNA] topics: gothic horror, unreliable narrator; style: lyrical, dark;
        excited_by: atmosphere, dread; vocabulary: liminal, uncanny

This text is prepended to the model's context (before the user's message)
as a soft conditioning signal. The model learns during fine-tuning to
attend to [DNA] prefixes and adjust its output accordingly.

MPS / persistence notes
-----------------------
- DNAMemory is a plain Python class (no nn.Module) — it holds no tensors
  and does not participate in the forward pass directly.
- Serialise with .to_dict() / .from_dict() for IndexedDB storage.
- Thread-safe for single-process inference (no locks needed).
"""

from __future__ import annotations

import json
import time
from collections import defaultdict
from dataclasses import dataclass, field
from typing import Any, Dict, List, Optional, Tuple


# ── Trait ────────────────────────────────────────────────────────────────────


@dataclass
class Trait:
    """
    A single observed user preference or characteristic.

    Attributes
    ----------
    key : str
        Normalised identifier (lowercase, stripped). E.g. "gothic horror".
    strength : float
        Evidence-weighted confidence in [0, 1]. Starts at the first
        observation signal and evolves via EMA on subsequent observations.
    observations : int
        Raw count of how many times this trait was observed.
    last_seen : float
        Unix timestamp of the most recent observation.
    first_seen : float
        Unix timestamp of the first observation.
    notes : str
        Optional free-text annotation (e.g. context of first observation).
    """
    key: str
    strength: float = 0.0
    observations: int = 0
    last_seen: float = field(default_factory=time.time)
    first_seen: float = field(default_factory=time.time)
    notes: str = ""

    def update(self, signal: float, momentum: float = 0.85) -> None:
        """
        Incorporate a new observation of strength `signal` ∈ [0, 1].

        strength_new = momentum × strength_old + (1 − momentum) × signal
        """
        if self.observations == 0:
            self.strength = signal
        else:
            self.strength = momentum * self.strength + (1.0 - momentum) * signal
        self.strength = float(min(1.0, max(0.0, self.strength)))
        self.observations += 1
        self.last_seen = time.time()

    def to_dict(self) -> dict:
        return {
            "key":          self.key,
            "strength":     round(self.strength, 4),
            "observations": self.observations,
            "last_seen":    self.last_seen,
            "first_seen":   self.first_seen,
            "notes":        self.notes,
        }

    @classmethod
    def from_dict(cls, d: dict) -> "Trait":
        t = cls(key=d["key"])
        t.strength     = float(d.get("strength", 0.0))
        t.observations = int(d.get("observations", 0))
        t.last_seen    = float(d.get("last_seen", time.time()))
        t.first_seen   = float(d.get("first_seen", t.last_seen))
        t.notes        = str(d.get("notes", ""))
        return t

    def __repr__(self) -> str:
        return f"Trait({self.key!r}, strength={self.strength:.2f}, n={self.observations})"


# ── DNA Memory ────────────────────────────────────────────────────────────────


class DNAMemory:
    """
    Persistent user-profile store — the model's accumulated understanding
    of who this specific user is as a writer and creative collaborator.

    Seven observation categories:
      topics              — recurring subjects in the user's writing / questions
      style_prefs         — prose style signals (lyrical, terse, dark, playful…)
      creative_triggers   — reliably excites the user (boosts positive arousal)
      sensitivities       — causes distress or negative reaction; handle gently
      emotional_patterns  — recurring emotional contexts ("frustrated with pacing")
      vocabulary          — words/phrases the user favours or reacts well to
      meta                — session statistics (not traits, just counters)

    Parameters
    ----------
    user_id : str
        Unique identifier for the user (e.g. IndexedDB book id or a UUID).
    ema_momentum : float
        EMA decay for trait strength updates. 0.85 ≈ 4-session half-life.
    prune_threshold : float
        Traits with strength below this are removed during pruning.
    max_traits_per_category : int
        Hard cap on traits per category (oldest/weakest pruned first).
    top_k_for_injection : int
        Number of traits per category to include in the [DNA] context prefix.
    """

    CATEGORIES = (
        "topics",
        "style_prefs",
        "creative_triggers",
        "sensitivities",
        "emotional_patterns",
        "vocabulary",
    )

    def __init__(
        self,
        user_id: str = "default",
        ema_momentum: float = 0.85,
        prune_threshold: float = 0.05,
        max_traits_per_category: int = 50,
        top_k_for_injection: int = 5,
    ) -> None:
        self.user_id                 = user_id
        self.ema_momentum            = ema_momentum
        self.prune_threshold         = prune_threshold
        self.max_traits_per_category = max_traits_per_category
        self.top_k_for_injection     = top_k_for_injection

        # Internal store: category → {key: Trait}
        self._store: Dict[str, Dict[str, Trait]] = {c: {} for c in self.CATEGORIES}

        # Session-level statistics
        self._meta: Dict[str, Any] = {
            "user_id":         user_id,
            "total_turns":     0,
            "session_count":   0,
            "created_at":      time.time(),
            "last_session_at": time.time(),
            "total_observations": 0,
        }

    # ── Observation API ───────────────────────────────────────────────────────

    def observe(
        self,
        category: str,
        key: str,
        signal: float = 0.5,
        notes: str = "",
    ) -> Trait:
        """
        Record an observation of a trait in the given category.

        Args
        ----
        category : str
            One of the CATEGORIES strings.
        key : str
            The trait identifier (will be normalised: lowercase, stripped).
        signal : float ∈ [0, 1]
            Intensity of the observation.
            0.3 = passing mention / neutral reaction
            0.6 = clear positive/negative reaction
            1.0 = strong, unambiguous signal (e.g. very excited)
        notes : str
            Optional context annotation (stored on first observation only).

        Returns
        -------
        Updated Trait object.
        """
        if category not in self._store:
            raise ValueError(f"Unknown category {category!r}. Choose from {self.CATEGORIES}")

        key = key.lower().strip()
        if not key:
            raise ValueError("Trait key must be non-empty.")
        signal = float(min(1.0, max(0.0, signal)))

        bucket = self._store[category]
        if key not in bucket:
            t = Trait(key=key, notes=notes)
            bucket[key] = t
        bucket[key].update(signal, momentum=self.ema_momentum)

        self._meta["total_observations"] += 1
        return bucket[key]

    def observe_topic(self, topic: str, signal: float = 0.5, notes: str = "") -> Trait:
        return self.observe("topics", topic, signal, notes)

    def observe_style(self, style: str, signal: float = 0.5, notes: str = "") -> Trait:
        return self.observe("style_prefs", style, signal, notes)

    def observe_trigger(self, trigger: str, signal: float = 0.8, notes: str = "") -> Trait:
        """Record something that excites or energises the user."""
        return self.observe("creative_triggers", trigger, signal, notes)

    def observe_sensitivity(self, topic: str, signal: float = 0.7, notes: str = "") -> Trait:
        """Record something the user reacts negatively to or finds distressing."""
        return self.observe("sensitivities", topic, signal, notes)

    def observe_emotional_pattern(self, pattern: str, signal: float = 0.5, notes: str = "") -> Trait:
        """Record a recurring emotional context (e.g. 'frustrated with pacing')."""
        return self.observe("emotional_patterns", pattern, signal, notes)

    def observe_vocabulary(self, word: str, signal: float = 0.4, notes: str = "") -> Trait:
        """Record a word or phrase the user uses or responds well to."""
        return self.observe("vocabulary", word, signal, notes)

    # ── Automatic ingest from EmotionState ────────────────────────────────────

    def ingest_from_emotion(
        self,
        emotion_state,                 # EmotionState from emotion_engine
        user_text: str,
        extracted_topics: Optional[List[str]] = None,
        extracted_words: Optional[List[str]] = None,
    ) -> None:
        """
        Automatically log observations based on detected emotional signals.

        High positive arousal (excitement) → logs topics/words as triggers.
        High negative arousal + low dominance → logs as sensitivities.
        Repeated vocabulary patterns → logged to vocabulary category.

        Args
        ----
        emotion_state      : EmotionState from EmotionEngine.detect()
        user_text          : raw text of the user's message
        extracted_topics   : optional list of topics already parsed from text
        extracted_words    : optional list of notable words to track
        """
        v = emotion_state.valence
        a = emotion_state.arousal
        d = emotion_state.dominance
        conf = emotion_state.confidence

        if conf < 0.15:
            return   # not enough signal to log anything

        # Creative excitement → log as trigger
        if v > 0.4 and a > 0.4:
            excitement = (v + a) / 2.0
            if extracted_topics:
                for topic in extracted_topics:
                    self.observe_trigger(topic, signal=excitement * conf)
            if extracted_words:
                for word in extracted_words[:3]:
                    self.observe_vocabulary(word, signal=0.5 * conf)

        # Distress / sensitivity signal
        elif v < -0.4 and (a > 0.3 or d < -0.4):
            sensitivity_signal = abs(v) * conf
            if extracted_topics:
                for topic in extracted_topics:
                    self.observe_sensitivity(topic, signal=sensitivity_signal)

        # Neutral engagement → soft topic observation
        elif extracted_topics and conf > 0.2:
            for topic in extracted_topics:
                self.observe_topic(topic, signal=0.3 * conf)

        self._meta["total_turns"] += 1

    # ── Retrieval ─────────────────────────────────────────────────────────────

    def top_traits(
        self,
        category: str,
        k: int = 5,
        min_strength: float = 0.10,
    ) -> List[Trait]:
        """
        Return the top-k strongest traits in a category.

        Args
        ----
        category     : one of CATEGORIES
        k            : maximum number of traits to return
        min_strength : exclude traits below this strength

        Returns
        -------
        List of Trait objects sorted by strength descending.
        """
        bucket = self._store.get(category, {})
        candidates = [t for t in bucket.values() if t.strength >= min_strength]
        return sorted(candidates, key=lambda t: t.strength, reverse=True)[:k]

    def trait(self, category: str, key: str) -> Optional[Trait]:
        """Return a specific trait, or None if not present."""
        return self._store.get(category, {}).get(key.lower().strip())

    # ── Context injection ─────────────────────────────────────────────────────

    def build_context_prefix(
        self,
        k: Optional[int] = None,
        min_strength: float = 0.15,
    ) -> str:
        """
        Build the [DNA] context string to prepend to the model's input.

        Only includes traits above min_strength and at most k per category.
        Categories with no qualifying traits are omitted entirely to keep
        the prefix short.

        Example output:
          [DNA] topics: gothic horror, unreliable narrator
                excited_by: atmosphere, dread, prose texture
                avoid: explicit violence
                style: lyrical, slow-burn
                vocabulary: liminal, uncanny, threshold

        Args
        ----
        k            : traits per category (defaults to self.top_k_for_injection)
        min_strength : minimum strength threshold

        Returns
        -------
        str — formatted prefix, or "" if the profile is empty.
        """
        k = k or self.top_k_for_injection
        lines: List[str] = []

        label_map = {
            "topics":             "topics",
            "style_prefs":        "style",
            "creative_triggers":  "excited_by",
            "sensitivities":      "avoid",
            "emotional_patterns": "patterns",
            "vocabulary":         "vocabulary",
        }

        for category, label in label_map.items():
            top = self.top_traits(category, k=k, min_strength=min_strength)
            if top:
                keys = ", ".join(t.key for t in top)
                lines.append(f"  {label}: {keys}")

        if not lines:
            return ""

        body = "\n".join(lines)
        return f"[DNA]\n{body}\n[/DNA]"

    # ── Maintenance ───────────────────────────────────────────────────────────

    def prune(self) -> int:
        """
        Remove traits below prune_threshold and enforce max_traits_per_category.

        Returns the number of traits pruned.
        """
        pruned = 0
        for category, bucket in self._store.items():
            # Remove weak traits
            weak = [k for k, t in bucket.items() if t.strength < self.prune_threshold]
            for k in weak:
                del bucket[k]
                pruned += 1

            # Enforce category cap: remove oldest/weakest
            if len(bucket) > self.max_traits_per_category:
                sorted_traits = sorted(bucket.values(), key=lambda t: t.strength)
                excess = len(bucket) - self.max_traits_per_category
                for t in sorted_traits[:excess]:
                    del bucket[t.key]
                    pruned += excess
        return pruned

    def start_session(self) -> None:
        """Call at the start of each session to update session metadata."""
        self._meta["session_count"] += 1
        self._meta["last_session_at"] = time.time()

    # ── Serialisation ─────────────────────────────────────────────────────────

    def to_dict(self) -> dict:
        """
        Serialise the full profile to a JSON-compatible dict.
        Suitable for storage in browser IndexedDB or a local JSON file.
        """
        store_dict = {
            category: {key: trait.to_dict() for key, trait in bucket.items()}
            for category, bucket in self._store.items()
        }
        return {
            "schema_version": 1,
            "meta":  self._meta.copy(),
            "store": store_dict,
            "config": {
                "ema_momentum":            self.ema_momentum,
                "prune_threshold":         self.prune_threshold,
                "max_traits_per_category": self.max_traits_per_category,
                "top_k_for_injection":     self.top_k_for_injection,
            },
        }

    @classmethod
    def from_dict(cls, d: dict) -> "DNAMemory":
        """
        Restore a DNAMemory from a serialised dict.
        Handles missing fields gracefully for forward compatibility.
        """
        cfg = d.get("config", {})
        obj = cls(
            user_id=d.get("meta", {}).get("user_id", "default"),
            ema_momentum=cfg.get("ema_momentum", 0.85),
            prune_threshold=cfg.get("prune_threshold", 0.05),
            max_traits_per_category=cfg.get("max_traits_per_category", 50),
            top_k_for_injection=cfg.get("top_k_for_injection", 5),
        )
        obj._meta.update(d.get("meta", {}))
        for category, bucket in d.get("store", {}).items():
            if category in obj._store:
                for key, trait_dict in bucket.items():
                    obj._store[category][key] = Trait.from_dict(trait_dict)
        return obj

    def to_json(self) -> str:
        """Serialise to a JSON string."""
        return json.dumps(self.to_dict(), indent=2)

    @classmethod
    def from_json(cls, s: str) -> "DNAMemory":
        """Restore from a JSON string."""
        return cls.from_dict(json.loads(s))

    # ── Diagnostics ──────────────────────────────────────────────────────────

    def profile_summary(self) -> dict:
        """
        A human-readable snapshot of the current profile state.
        Useful for debugging, UI display, or logging.
        """
        summary: dict = {"meta": self._meta.copy(), "categories": {}}
        for category in self.CATEGORIES:
            top = self.top_traits(category, k=10)
            summary["categories"][category] = [
                {"key": t.key, "strength": round(t.strength, 3), "n": t.observations}
                for t in top
            ]
        return summary

    def __len__(self) -> int:
        """Total number of traits across all categories."""
        return sum(len(b) for b in self._store.values())

    def __repr__(self) -> str:
        n = len(self)
        sessions = self._meta.get("session_count", 0)
        return f"DNAMemory(user={self.user_id!r}, traits={n}, sessions={sessions})"
