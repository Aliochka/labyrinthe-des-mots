#!/usr/bin/env python3
import json
import argparse
from typing import Dict


def load_json(path: str):
    with open(path, "r", encoding="utf-8") as f:
        return json.load(f)


def load_membership_jsonl(path: str) -> Dict[str, str]:
    out = {}
    with open(path, "r", encoding="utf-8") as f:
        for line in f:
            if not line.strip():
                continue
            o = json.loads(line)
            out[o["lemma"]] = o["galaxy"]
    return out


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--galaxies-named", required=True)
    ap.add_argument("--galaxies-pos", required=True)
    ap.add_argument("--stars-pos", required=True)
    ap.add_argument("--membership", required=True)
    ap.add_argument("--out", default="universe.json")
    args = ap.parse_args()

    galaxies_named = load_json(args.galaxies_named)
    galaxies_pos = load_json(args.galaxies_pos)
    stars_pos = load_json(args.stars_pos)
    membership = load_membership_jsonl(args.membership)

    # --- Galaxies ---
    galaxies = []
    for g in galaxies_named.get("galaxies", []):
        gid = g["galaxy"]
        pos = galaxies_pos.get(gid)
        if not pos:
            continue

        galaxies.append(
            {
                "id": gid,
                "name": g["name"],
                "slug": g.get("slug"),
                "confidence": g.get("confidence"),
                "size": g.get("size"),
                "x": pos["x"],
                "y": pos["y"],
                "z": pos["z"],
            }
        )

    # --- Stars ---
    stars = []
    for lemma, pos in stars_pos.items():
        stars.append(
            {
                "id": lemma,
                "galaxy": membership.get(lemma, "void"),
                "x": pos["x"],
                "y": pos["y"],
                "z": pos["z"],
            }
        )

    universe = {
        "meta": {
            "galaxies": len(galaxies),
            "stars": len(stars),
        },
        "galaxies": galaxies,
        "stars": stars,
    }

    with open(args.out, "w", encoding="utf-8") as f:
        json.dump(universe, f, ensure_ascii=False, indent=2)

    print("🌌 Universe exporté")
    print(f"→ galaxies: {len(galaxies)}")
    print(f"→ stars:    {len(stars)}")
    print(f"→ fichier:  {args.out}")


if __name__ == "__main__":
    main()
