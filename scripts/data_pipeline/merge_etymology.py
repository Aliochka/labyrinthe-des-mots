#!/usr/bin/env python3
# -*- coding: utf-8 -*-

import argparse
import json
from collections import defaultdict

def iter_jsonl(path: str):
    with open(path, "r", encoding="utf-8") as f:
        for line in f:
            line = line.strip()
            if not line:
                continue
            try:
                yield json.loads(line)
            except json.JSONDecodeError:
                continue

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--graph", required=True, help="Input lemma graph JSON (has nodes+edges)")
    ap.add_argument("--etym", required=True, help="Input etym edges JSONL")
    ap.add_argument("--out", required=True, help="Output merged lemma graph JSON")

    ap.add_argument("--capPerSource", type=int, default=5)
    ap.add_argument("--capExternalDegree", type=int, default=200)
    ap.add_argument("--weight", type=float, default=0.2)  # base weight multiplied by confidence
    ap.add_argument("--skipMissingSource", action="store_true", default=True,
                    help="Skip etym edges when source lemma not in graph (default true)")

    args = ap.parse_args()

    print(f"📥 Loading graph: {args.graph}")
    with open(args.graph, "r", encoding="utf-8") as f:
        g = json.load(f)

    if "nodes" not in g or "edges" not in g:
        raise SystemExit("Graph must contain 'nodes' and 'edges' fields (your file uses edges, not links).")

    nodes = g["nodes"]
    edges = g["edges"]

    # Existing lemma set
    lemma_set = set()
    for n in nodes:
        lemma = n.get("lemma")
        if lemma:
            lemma_set.add(lemma)

    # Caps tracking
    added_per_source = defaultdict(int)
    external_degree = defaultdict(int)

    # Seed external_degree from existing ETYMOLOGY edges if any
    for e in edges:
        if "ETYMOLOGY" in (e.get("relationTypes") or []):
            tgt = e.get("target")
            if tgt:
                external_degree[tgt] += 1

    added_nodes = 0
    added_edges = 0

    print(f"🔗 Merging etym edges: {args.etym}")

    for e in iter_jsonl(args.etym):
        source = e.get("source")
        target_norm = e.get("targetNorm")
        lang = e.get("lang")
        target_display = e.get("target") or target_norm
        confidence = float(e.get("confidence", 0.85))

        if not source or not target_norm or not lang:
            continue

        # source lemma must exist
        if source not in lemma_set:
            if args.skipMissingSource:
                continue

        # cap per source lemma
        if added_per_source[source] >= args.capPerSource:
            continue

        ext_lemma = f"{lang}:{target_norm}"

        # cap external degree
        if external_degree[ext_lemma] >= args.capExternalDegree:
            continue

        # add external node if missing
        if ext_lemma not in lemma_set:
            nodes.append({
                "lemma": ext_lemma,
                "synsets": [],          # keep same shape as LemmaNode
                "senseCount": 0,
                "relationCount": 0,
                "kind": "etym_external",
                "lang": lang,
                "hidden": True,
                "label": target_display,  # optional, handy for UI
            })
            lemma_set.add(ext_lemma)
            added_nodes += 1

        # add ETYMOLOGY edge
        edges.append({
            "source": source,
            "target": ext_lemma,
            "weight": max(0.01, args.weight * confidence),
            "relationTypes": ["ETYMOLOGY"],
            "relationTypeCounts": {"ETYMOLOGY": 1},
            "direction": e.get("direction", "derived_from"),
            "evidence": e.get("evidence", {"provider": "wiktionary", "title": source}),
            "confidence": confidence,
        })

        added_per_source[source] += 1
        external_degree[ext_lemma] += 1
        added_edges += 1

    # ✅ Recompute relationCount (degree) after merge
    deg = defaultdict(int)
    for ed in edges:
        s = ed.get("source")
        t = ed.get("target")
        if s:
            deg[s] += 1
        if t:
            deg[t] += 1

    for n in nodes:
        lemma = n.get("lemma")
        if lemma is not None:
            n["relationCount"] = deg.get(lemma, 0)

    print(f"✅ Added {added_edges} etymology edges")
    print(f"🧬 Added {added_nodes} external nodes")

    print(f"💾 Writing merged graph: {args.out}")
    with open(args.out, "w", encoding="utf-8") as f:
        json.dump(g, f, ensure_ascii=False)

if __name__ == "__main__":
    main()
