#!/usr/bin/env python3
import json
import argparse
import re
from typing import List, Dict, Any

# --------------------------------------------------
# Stoplist minimale (volontairement courte)
# --------------------------------------------------

STOPWORDS = {
    "etre",
    "faire",
    "avoir",
    "chose",
    "element",
    "partie",
    "ensemble",
    "objet",
    "point",
    "situation",
    "etat",
    "action",
    "activite",
    "fonction",
    "resultat",
    "cause",
    "lieu",
    "idee",
    "groupe",
    "processus",
    "systeme",
}

# --------------------------------------------------
# Utils
# --------------------------------------------------


def clean_word(w: str) -> str:
    return re.sub(r"[_\-]+", " ", (w or "")).strip().lower()


def title(w: str) -> str:
    cw = clean_word(w)
    return cw[:1].upper() + cw[1:] if cw else ""


def slugify(words: List[str]) -> str:
    return "_".join(clean_word(w).replace(" ", "_") for w in words if clean_word(w))


def select_keywords(top: List[str], k: int = 3) -> List[str]:
    kept = []
    for w in top or []:
        cw = clean_word(w)
        if not cw:
            continue
        if cw in STOPWORDS:
            continue
        if len(cw) < 3:
            continue
        kept.append(w)
        if len(kept) >= k:
            break
    return kept


def confidence(top: List[str], kept: List[str]) -> float:
    if not top:
        return 0.0
    return round(len(kept) / min(len(top), 5), 2)


# --------------------------------------------------
# Input adapters
# --------------------------------------------------


def iter_galaxies(data: Dict[str, Any]):
    """
    Supporte 2 formats :
    - Nouveau: {"galaxies":[{"galaxy": "...", "size":..., "top":[...]}]}
    - Ancien: {"clusters": {"0": {"size":..., "top":[...]} , ...}}
    """
    if "galaxies" in data and isinstance(data["galaxies"], list):
        for g in data["galaxies"]:
            yield g
        return

    if "clusters" in data and isinstance(data["clusters"], dict):
        for cid, info in data["clusters"].items():
            yield {
                "galaxy": f"gc_{cid}",
                "size": info.get("size", 0),
                "top": info.get("top", []),
            }
        return

    raise KeyError(
        "Input must contain either 'galaxies' (new format) or 'clusters' (legacy format)."
    )


# --------------------------------------------------
# Main
# --------------------------------------------------


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument(
        "--clusters",
        required=True,
        help="Input JSON (galaxies.json or legacy gc_clusters.json)",
    )
    ap.add_argument("--out", default="galaxies_named.json")
    args = ap.parse_args()

    with open(args.clusters, "r", encoding="utf-8") as f:
        data = json.load(f)

    named = []
    for g in iter_galaxies(data):
        galaxy_id = g.get("galaxy")
        top = g.get("top", []) or []
        # size = int(g.get("size", 0) or 0)

        keywords = select_keywords(top, k=3)

        if keywords:
            # 2 mots suffisent pour un nom court (on garde 3 en réserve si besoin plus tard)
            name = " & ".join(title(w) for w in keywords[:2])
            slug = slugify(keywords[:2])
        else:
            name = galaxy_id or "Galaxy"
            slug = slugify([galaxy_id or "galaxy"])

        named.append(
            {
                **g,
                "name": name,
                "slug": slug,
                "confidence": confidence(top, keywords),
            }
        )

    out = {
        "scenario": data.get("scenario"),
        "resolution": data.get("resolution"),
        "galaxies": named,
    }

    with open(args.out, "w", encoding="utf-8") as f:
        json.dump(out, f, ensure_ascii=False, indent=2)

    print(f"✅ {len(named)} galaxies nommées → {args.out}")


if __name__ == "__main__":
    main()
