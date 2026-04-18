"""MavenSLM evaluation — perplexity, sample generation, lore grounding.

Loads a trained checkpoint and runs three evaluation modes:

  1. Perplexity  — loss on val + test splits  (quantitative)
  2. Samples     — 10 prompted continuations  (qualitative)
  3. Lore probe  — does the model use injected <|lore|> context?

Usage:
    python eval.py --checkpoint checkpoints/best.pt
    python eval.py --checkpoint checkpoints/best.pt --mode perplexity
    python eval.py --checkpoint checkpoints/best.pt --mode samples
    python eval.py --checkpoint checkpoints/best.pt --mode lore
    python eval.py --checkpoint checkpoints/best.pt --mode all
"""

import argparse
import math
import random
import sys
from pathlib import Path

import numpy as np
import torch
from transformers import PreTrainedTokenizerFast

sys.path.insert(0, str(Path(__file__).parent))
from maven_slm import MavenSLM, MavenSLMConfig
from train import ShardLoader, pick_device, pick_dtype


# ---------------------------------------------------------------------------
# Perplexity
# ---------------------------------------------------------------------------

@torch.no_grad()
def compute_perplexity(
    model: MavenSLM,
    shard_dir: Path,
    device: torch.device,
    batch_size: int = 4,
    block_size: int = 2048,
    n_batches: int = 200,
) -> float:
    """Estimate perplexity on a shard directory. Returns PPL = exp(mean_loss)."""
    dtype = pick_dtype(device)
    autocast_ctx = torch.autocast(device_type=device.type, dtype=dtype, enabled=(dtype != torch.float32))

    loader = ShardLoader(shard_dir, batch_size, block_size, device)
    model.eval()
    total_loss = 0.0

    for i in range(n_batches):
        x, y = loader.next_batch()
        with autocast_ctx:
            _, loss = model(x, y)
        total_loss += loss.item()
        if (i + 1) % 50 == 0:
            print(f"  [{i+1}/{n_batches}] running loss={total_loss/(i+1):.4f}")

    mean_loss = total_loss / n_batches
    ppl = math.exp(mean_loss)
    model.train()
    return ppl


# ---------------------------------------------------------------------------
# Sample generation
# ---------------------------------------------------------------------------

_SAMPLE_PROMPTS = [
    "<|bos|>",
    "<|bos|> The old wizard stepped",
    "<|bos|> She had never seen",
    "<|bos|> The dragon's eyes narrowed as",
    "<|bos|> Rain fell on the cobblestones",
    "<|bos|> He opened the ancient tome and",
    "<|bos|> The forest grew darker with every step",
    "<|bos|> \"I know what you did,\" she said",
    "<|bos|> The kingdom had been at peace for",
    "<|bos|> In the market square, a stranger",
]


@torch.no_grad()
def generate_samples(
    model: MavenSLM,
    tokenizer: PreTrainedTokenizerFast,
    device: torch.device,
    prompts: list[str] | None = None,
    max_new_tokens: int = 150,
    temperature: float = 0.8,
    top_k: int = 50,
    top_p: float = 0.9,
) -> list[dict]:
    """Generate text for each prompt. Returns list of {prompt, generated} dicts."""
    prompts = prompts or _SAMPLE_PROMPTS
    model.eval()
    results = []

    for prompt in prompts:
        ids = tokenizer.encode(prompt, add_special_tokens=False)
        x   = torch.tensor([ids], dtype=torch.long, device=device)
        out = model.generate(
            x, max_new_tokens=max_new_tokens,
            temperature=temperature, top_k=top_k, top_p=top_p,
        )
        full  = tokenizer.decode(out[0].tolist(), skip_special_tokens=False)
        # Strip the prompt from the display
        generated = full[len(tokenizer.decode(ids, skip_special_tokens=False)):]
        results.append({"prompt": prompt, "generated": generated.strip()})

    model.train()
    return results


# ---------------------------------------------------------------------------
# Lore grounding probe
# ---------------------------------------------------------------------------

_LORE_PROBES = [
    {
        "name": "Sunlight magic block",
        "prompt": (
            "<|lore|> Kira cannot use magic in sunlight. "
            "Her power only works at night or underground.\n"
            "<|scene|> Kira stepped into the sunlit courtyard and reached for her power.\n"
            "<|inst|> Continue the scene in 2–3 sentences. <|/inst|>\n"
        ),
        "desired_themes": ["sun", "light", "power", "nothing", "couldn", "could not",
                           "fail", "weaken", "drained", "empty", "useless"],
        "avoid_themes":   ["cast a spell", "magic flowed", "power surged"],
    },
    {
        "name": "Poisoned water",
        "prompt": (
            "<|lore|> The Ashfen Marshes water is lethal to drink. "
            "Even a single sip causes death within an hour.\n"
            "<|scene|> Parched and desperate after three days without water, "
            "the traveller knelt beside the glowing green pool.\n"
            "<|inst|> Continue the scene in 2–3 sentences. <|/inst|>\n"
        ),
        "desired_themes": ["warn", "hesitat", "poison", "death", "didn't drink",
                           "couldn't", "glow", "sick", "danger", "step back"],
        "avoid_themes":   ["drank deeply", "quenched", "refreshed", "cool water"],
    },
    {
        "name": "Sealed vault door",
        "prompt": (
            "<|lore|> The Vault of Echoes can only be opened by speaking the "
            "true name of its first keeper: Aldric Vane.\n"
            "<|scene|> The expedition stood before the massive iron door. "
            'Mira pressed her palm to the cold metal. "Let us in," she said.\n'
            "<|inst|> Continue the scene in 2–3 sentences. <|/inst|>\n"
        ),
        "desired_themes": ["nothing", "remain", "sealed", "didn't open", "true name",
                           "Aldric", "Vane", "silence", "unmoved", "refused"],
        "avoid_themes":   ["swung open", "creaked open", "door opened"],
    },
]


@torch.no_grad()
def run_lore_probes(
    model: MavenSLM,
    tokenizer: PreTrainedTokenizerFast,
    device: torch.device,
    max_new_tokens: int = 100,
) -> list[dict]:
    """Test whether the model respects injected lore constraints."""
    model.eval()
    results = []

    for probe in _LORE_PROBES:
        ids = tokenizer.encode(probe["prompt"], add_special_tokens=False)
        x   = torch.tensor([ids], dtype=torch.long, device=device)
        out = model.generate(x, max_new_tokens=max_new_tokens, temperature=0.3, top_k=20)
        # Low temperature for deterministic probing
        generated = tokenizer.decode(
            out[0, len(ids):].tolist(), skip_special_tokens=True
        ).lower()

        desired_hits = [t for t in probe["desired_themes"] if t in generated]
        avoid_hits   = [t for t in probe["avoid_themes"]   if t in generated]
        # Score: +1 per desired hit, -1 per avoid hit (0–1 normalised)
        raw_score    = len(desired_hits) - len(avoid_hits)
        max_possible = len(probe["desired_themes"])
        score        = max(0.0, raw_score / max(max_possible, 1))

        results.append({
            "name":         probe["name"],
            "generated":    generated.strip(),
            "desired_hits": desired_hits,
            "avoid_hits":   avoid_hits,
            "score":        score,
        })

    model.train()
    return results


# ---------------------------------------------------------------------------
# Report helpers
# ---------------------------------------------------------------------------

def print_perplexity_report(val_ppl: float, test_ppl: float) -> None:
    print(f"\n{'─'*50}")
    print(f"  Perplexity")
    print(f"{'─'*50}")
    print(f"  val   PPL  : {val_ppl:.2f}")
    print(f"  test  PPL  : {test_ppl:.2f}")
    grade = (
        "Excellent (target met ✓)"  if val_ppl < 20  else
        "Good"                       if val_ppl < 40  else
        "Needs more training"        if val_ppl < 100 else
        "Undertrained"
    )
    print(f"  Assessment : {grade}")
    print()


def print_sample_report(results: list[dict]) -> None:
    print(f"\n{'─'*50}")
    print(f"  Generated Samples")
    print(f"{'─'*50}")
    for i, r in enumerate(results, 1):
        print(f"\n[{i}] Prompt: {r['prompt']}")
        print(f"    {r['generated'][:300]}")
    print()


def print_lore_report(results: list[dict]) -> None:
    print(f"\n{'─'*50}")
    print(f"  Lore Grounding Probe")
    print(f"{'─'*50}")
    total_score = 0.0
    for r in results:
        bar = "█" * int(r["score"] * 10) + "░" * (10 - int(r["score"] * 10))
        print(f"\n  [{bar}] {r['score']:.0%}  {r['name']}")
        print(f"  Generated : {r['generated'][:200]}")
        if r["desired_hits"]:
            print(f"  ✓ Themes  : {', '.join(r['desired_hits'])}")
        if r["avoid_hits"]:
            print(f"  ✗ Lore-breaks: {', '.join(r['avoid_hits'])}")
        total_score += r["score"]
    avg = total_score / len(results)
    print(f"\n  Overall lore-grounding score: {avg:.0%}")
    note = (
        "Strong lore awareness ✓" if avg > 0.5  else
        "Partial — improve with fine-tuning (Phase 4)"
    )
    print(f"  {note}")
    print()


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

def main() -> None:
    parser = argparse.ArgumentParser(description="Evaluate MavenSLM checkpoint")
    parser.add_argument("--checkpoint",  required=True, help="Path to .pt checkpoint")
    parser.add_argument("--tokenizer",   default="tokenizer/maven-tokenizer")
    parser.add_argument("--data-dir",    default="data/tokenized")
    parser.add_argument("--device",      default="")
    parser.add_argument("--mode",
                        choices=["perplexity", "samples", "lore", "all"],
                        default="all")
    parser.add_argument("--val-batches", type=int, default=200)
    args = parser.parse_args()

    device = pick_device(args.device)
    print(f"Device: {device}\n")

    # Load model
    ckpt = torch.load(args.checkpoint, map_location="cpu", weights_only=False)
    model_config = MavenSLMConfig(**ckpt["model_config"])
    model = MavenSLM(model_config)
    model.load_state_dict(ckpt["model_state"])
    model.to(device).eval()
    print(f"Loaded: {args.checkpoint}  (step={ckpt['step']})")

    # Load tokenizer
    tokenizer = PreTrainedTokenizerFast.from_pretrained(args.tokenizer)
    data_dir  = Path(args.data_dir)

    mode = args.mode

    if mode in ("perplexity", "all"):
        print("\nComputing val perplexity…")
        val_ppl  = compute_perplexity(model, data_dir / "val",  device, n_batches=args.val_batches)
        print("Computing test perplexity…")
        test_ppl = compute_perplexity(model, data_dir / "test", device, n_batches=args.val_batches)
        print_perplexity_report(val_ppl, test_ppl)

    if mode in ("samples", "all"):
        print("\nGenerating samples…")
        results = generate_samples(model, tokenizer, device)
        print_sample_report(results)

    if mode in ("lore", "all"):
        print("\nRunning lore grounding probes…")
        lore_results = run_lore_probes(model, tokenizer, device)
        print_lore_report(lore_results)


if __name__ == "__main__":
    main()
