"""Generate synthetic instruction fine-tuning pairs for MavenSLM.

Produces 50k examples covering the five Maven task types:
  1. scene-continue   — continue a scene excerpt
  2. lore-grounded    — continue respecting World Bible facts
  3. style-match      — continue in the same prose voice
  4. outline-expand   — expand a bullet outline to prose
  5. lore-sentinel    — detect world facts changed in a scene (JSON)

Two generation modes:
  --mode corpus   Extract pairs directly from the training corpus
                  (no Ollama required — fully offline, lower quality)
  --mode ollama   Use a local Ollama model to generate continuations
                  (higher quality, requires Ollama running)

Usage:
    python data/generate_instruction_pairs.py \\
        --corpus    data/clean \\
        --output    data/instruction_pairs \\
        --mode      corpus \\
        --n         50000

    python data/generate_instruction_pairs.py \\
        --corpus  data/clean \\
        --output  data/instruction_pairs \\
        --mode    ollama \\
        --model   llama3.1:8b \\
        --n       50000
"""

import argparse
import json
import random
import re
import sys
from pathlib import Path
from typing import Iterator

from tqdm import tqdm

# ---------------------------------------------------------------------------
# Prompt templates
# ---------------------------------------------------------------------------

TEMPLATES = {
    "scene-continue": (
        "<|inst|> Continue this scene for around 150 words, "
        "maintaining the established tone and style. <|/inst|>\n"
        "<|scene|> {context}\n"
        "{continuation}"
    ),
    "lore-grounded": (
        "<|lore|> {lore}\n"
        "<|scene|> {context}\n"
        "<|inst|> Continue the scene, staying consistent with the lore above. <|/inst|>\n"
        "{continuation}"
    ),
    "style-match": (
        "<|style|> {sample}\n"
        "<|inst|> Write the next paragraph of this story in the same voice and style. <|/inst|>\n"
        "{continuation}"
    ),
    "outline-expand": (
        "<|inst|> Expand this outline point into a prose scene of around 150 words:\n"
        "{outline} <|/inst|>\n"
        "{prose}"
    ),
    "lore-sentinel": (
        "<|scene|> {scene}\n"
        "<|inst|> Identify any world facts established or changed in this scene. "
        "Respond ONLY with valid JSON in this format: "
        '{"proposals": [{{"field": "...", "entry": "...", "newValue": "..."}}]} <|/inst|>\n'
        "{json_response}"
    ),
}

# ---------------------------------------------------------------------------
# Corpus-based extraction (offline, no Ollama)
# ---------------------------------------------------------------------------

_SENTENCE_RE = re.compile(r"(?<=[.!?])\s+")
_PARAGRAPH_RE = re.compile(r"\n\n+")


def _split_sentences(text: str) -> list[str]:
    return [s.strip() for s in _SENTENCE_RE.split(text) if len(s.strip()) > 20]


def _split_paragraphs(text: str) -> list[str]:
    return [p.strip() for p in _PARAGRAPH_RE.split(text) if len(p.strip()) > 80]


def _random_excerpt(text: str, min_words: int = 60, max_words: int = 150, rng: random.Random = None) -> str:
    if rng is None:
        rng = random.Random()
    words = text.split()
    if len(words) < min_words:
        return text
    start = rng.randint(0, max(0, len(words) - max_words - min_words))
    length = rng.randint(min_words, min(max_words, len(words) - start))
    return " ".join(words[start : start + length])


def _random_continuation(text: str, context: str, rng: random.Random) -> str | None:
    """Find context in text and return the following ~100 words."""
    idx = text.find(context[:80])
    if idx < 0:
        return None
    rest = text[idx + len(context):]
    words = rest.split()
    if len(words) < 30:
        return None
    return " ".join(words[: rng.randint(80, 150)])


def _make_lore_entry(paragraphs: list[str], rng: random.Random) -> str:
    """Synthesise a simple lore entry from a paragraph."""
    para = rng.choice(paragraphs)
    words = para.split()
    # Extract a plausible "character" or "location" name: capitalised word
    caps = [w for w in words if w[0].isupper() and len(w) > 3 and w.isalpha()]
    name = rng.choice(caps) if caps else "The character"
    # Take first two sentences as "lore fact"
    sents = _split_sentences(para)
    fact = " ".join(sents[:2]) if sents else para[:200]
    return f"{name}: {fact}"


def _make_sentinel_json(paragraphs: list[str], rng: random.Random) -> tuple[str, str]:
    """Return (scene, json_proposals) pair."""
    scene = rng.choice(paragraphs)
    words = scene.split()
    caps = [w for w in words if w[0].isupper() and len(w) > 3 and w.isalpha()]
    if not caps:
        return scene, '{"proposals": []}'
    entity = rng.choice(caps)
    proposals = [{"field": "status", "entry": entity, "newValue": "changed"}]
    return scene, json.dumps({"proposals": proposals})


def _make_outline(paragraphs: list[str], rng: random.Random) -> tuple[str, str]:
    """Return (outline_bullet, prose_expansion) pair."""
    para = rng.choice(paragraphs)
    sents = _split_sentences(para)
    if not sents:
        return para[:80] + "…", para
    # First sentence → outline bullet, rest → expansion
    outline = "- " + sents[0]
    prose = para
    return outline, prose


def _iter_corpus_pairs(
    corpus_dir: Path,
    n: int,
    rng: random.Random,
) -> Iterator[dict]:
    files = list(corpus_dir.rglob("*.txt"))
    if not files:
        raise FileNotFoundError(f"No .txt files in {corpus_dir}")

    rng.shuffle(files)
    generated = 0
    task_cycle = [
        "scene-continue", "lore-grounded", "style-match",
        "outline-expand", "lore-sentinel",
    ]
    task_idx = 0

    for path in files:
        if generated >= n:
            break
        try:
            text = path.read_text(encoding="utf-8", errors="replace")
        except OSError:
            continue

        paragraphs = _split_paragraphs(text)
        if len(paragraphs) < 4:
            continue

        task = task_cycle[task_idx % len(task_cycle)]
        task_idx += 1

        if task == "scene-continue":
            context = _random_excerpt(text, rng=rng)
            continuation = _random_continuation(text, context, rng)
            if not continuation:
                continue
            yield {
                "task": task,
                "text": TEMPLATES[task].format(context=context, continuation=continuation),
            }

        elif task == "lore-grounded":
            lore = _make_lore_entry(paragraphs, rng)
            context = _random_excerpt(text, rng=rng)
            continuation = _random_continuation(text, context, rng)
            if not continuation:
                continue
            yield {
                "task": task,
                "text": TEMPLATES[task].format(lore=lore, context=context, continuation=continuation),
            }

        elif task == "style-match":
            sample = _random_excerpt(text, min_words=40, max_words=80, rng=rng)
            continuation = _random_continuation(text, sample, rng)
            if not continuation:
                continue
            yield {
                "task": task,
                "text": TEMPLATES[task].format(sample=sample, continuation=continuation),
            }

        elif task == "outline-expand":
            outline, prose = _make_outline(paragraphs, rng)
            yield {
                "task": task,
                "text": TEMPLATES[task].format(outline=outline, prose=prose),
            }

        elif task == "lore-sentinel":
            scene, json_response = _make_sentinel_json(paragraphs, rng)
            yield {
                "task": task,
                "text": TEMPLATES[task].format(scene=scene, json_response=json_response),
            }

        generated += 1


# ---------------------------------------------------------------------------
# Ollama-based generation (higher quality)
# ---------------------------------------------------------------------------

def _ollama_generate(prompt: str, model: str, base_url: str = "http://localhost:11434") -> str | None:
    import urllib.request
    import urllib.error

    payload = json.dumps({"model": model, "prompt": prompt, "stream": False}).encode()
    req = urllib.request.Request(
        f"{base_url}/api/generate",
        data=payload,
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    try:
        with urllib.request.urlopen(req, timeout=30) as resp:
            data = json.loads(resp.read())
            return data.get("response", "").strip()
    except (urllib.error.URLError, json.JSONDecodeError):
        return None


def _iter_ollama_pairs(
    corpus_dir: Path,
    n: int,
    model: str,
    rng: random.Random,
) -> Iterator[dict]:
    # Verify Ollama is reachable
    test = _ollama_generate("Say 'ok'.", model)
    if not test:
        print(
            f"Error: Ollama not reachable or model '{model}' not loaded.\n"
            "Start Ollama and run: ollama pull {model}",
            file=sys.stderr,
        )
        sys.exit(1)

    files = list(corpus_dir.rglob("*.txt"))
    rng.shuffle(files)
    generated = 0

    for path in files:
        if generated >= n:
            break
        try:
            text = path.read_text(encoding="utf-8", errors="replace")
        except OSError:
            continue

        paragraphs = _split_paragraphs(text)
        if len(paragraphs) < 4:
            continue

        context = _random_excerpt(text, rng=rng)
        prompt = (
            f"You are a writing assistant. Continue the following scene excerpt "
            f"in the same style for exactly 120–150 words. Output only the continuation, "
            f"no explanation.\n\nScene:\n{context}\n\nContinuation:"
        )
        continuation = _ollama_generate(prompt, model)
        if not continuation or len(continuation.split()) < 30:
            continue

        yield {
            "task": "scene-continue",
            "text": TEMPLATES["scene-continue"].format(
                context=context, continuation=continuation
            ),
        }
        generated += 1


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

def main() -> None:
    parser = argparse.ArgumentParser(description="Generate instruction fine-tuning pairs")
    parser.add_argument("--corpus",  required=True, help="Cleaned corpus directory")
    parser.add_argument("--output",  required=True, help="Output directory for JSONL files")
    parser.add_argument("--mode",    choices=["corpus", "ollama"], default="corpus")
    parser.add_argument("--n",       type=int, default=50_000, help="Number of pairs to generate")
    parser.add_argument("--model",   default="llama3.1:8b", help="Ollama model (ollama mode only)")
    parser.add_argument("--seed",    type=int, default=42)
    args = parser.parse_args()

    out_dir = Path(args.output)
    out_dir.mkdir(parents=True, exist_ok=True)
    out_path = out_dir / "instruction_pairs.jsonl"

    rng = random.Random(args.seed)

    print(f"Generating {args.n:,} instruction pairs (mode={args.mode})…")

    if args.mode == "corpus":
        pair_iter = _iter_corpus_pairs(Path(args.corpus), args.n, rng)
    else:
        pair_iter = _iter_ollama_pairs(Path(args.corpus), args.n, args.model, rng)

    task_counts: dict[str, int] = {}
    with out_path.open("w", encoding="utf-8") as f:
        for pair in tqdm(pair_iter, total=args.n, desc="Generating"):
            f.write(json.dumps(pair, ensure_ascii=False) + "\n")
            task_counts[pair["task"]] = task_counts.get(pair["task"], 0) + 1

    total = sum(task_counts.values())
    print(f"\nGenerated {total:,} pairs → {out_path}")
    for task, count in sorted(task_counts.items()):
        print(f"  {task:20s}: {count:,}")

    print(f"\nNext step: use {out_path} in Phase 4 fine-tuning.")


if __name__ == "__main__":
    main()
