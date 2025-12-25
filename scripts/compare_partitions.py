#!/usr/bin/env python3
# -*- coding: utf-8 -*-

import json
import argparse
from collections import defaultdict, Counter
import math

def read_membership_jsonl(path: str):
    """
    Attendu: lignes JSON avec au moins:
      - lemma (ou node / id) : str
      - cluster (ou galaxy / community) : int/str
    Adapte les clés ci-dessous si besoin.
    """
    m = {}
    with open(path, "r", encoding="utf-8") as f:
        for line in f:
            line = line.strip()
            if not line: 
                continue
            o = json.loads(line)

            lemma = o.get("lemma") or o.get("node") or o.get("id")
            cl = o.get("cluster") or o.get("galaxy") or o.get("community")

            if lemma is None or cl is None:
                continue
            m[lemma] = str(cl)
    return m

def contingency(a_map, b_map):
    common = sorted(set(a_map) & set(b_map))
    a_labels = [a_map[x] for x in common]
    b_labels = [b_map[x] for x in common]
    n = len(common)

    # remap labels to ints
    a_ids = {lab:i for i, lab in enumerate(sorted(set(a_labels)))}
    b_ids = {lab:i for i, lab in enumerate(sorted(set(b_labels)))}
    A = [a_ids[lab] for lab in a_labels]
    B = [b_ids[lab] for lab in b_labels]

    # contingency counts
    nij = defaultdict(int)
    ai = Counter(A)
    bj = Counter(B)
    for i,j in zip(A,B):
        nij[(i,j)] += 1

    return n, nij, ai, bj, len(a_ids), len(b_ids)

def entropy(counts, n):
    # counts: iterable of cluster sizes
    h = 0.0
    for c in counts:
        p = c / n
        if p > 0:
            h -= p * math.log(p)
    return h

def nmi(a_map, b_map):
    n, nij, ai, bj, ka, kb = contingency(a_map, b_map)
    if n == 0:
        return 0.0

    # Mutual Information
    mi = 0.0
    for (i,j), c in nij.items():
        pij = c / n
        pi = ai[i] / n
        pj = bj[j] / n
        mi += pij * math.log(pij/(pi*pj))

    ha = entropy(ai.values(), n)
    hb = entropy(bj.values(), n)
    if ha == 0 or hb == 0:
        return 0.0
    return mi / math.sqrt(ha*hb)

def vi(a_map, b_map):
    # Variation of Information = H(A)+H(B)-2I(A;B)
    n, nij, ai, bj, ka, kb = contingency(a_map, b_map)
    if n == 0:
        return 0.0

    # MI
    mi = 0.0
    for (i,j), c in nij.items():
        pij = c / n
        pi = ai[i] / n
        pj = bj[j] / n
        mi += pij * math.log(pij/(pi*pj))

    ha = entropy(ai.values(), n)
    hb = entropy(bj.values(), n)
    return (ha + hb - 2*mi)

def top_sizes(m):
    sizes = Counter(m.values())
    return sizes, sizes.most_common(10)

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--baseline", required=True)
    ap.add_argument("--etym", required=True)
    args = ap.parse_args()

    base = read_membership_jsonl(args.baseline)
    etym = read_membership_jsonl(args.etym)

    common = set(base) & set(etym)
    only_base = set(base) - set(etym)
    only_etym = set(etym) - set(base)

    print("=== Coverage ===")
    print("baseline nodes:", len(base))
    print("etym nodes:", len(etym))
    print("common nodes:", len(common))
    print("only baseline:", len(only_base))
    print("only etym:", len(only_etym), "(souvent des etym_external)")

    base_sizes, base_top = top_sizes({k:base[k] for k in common})
    etym_sizes, etym_top = top_sizes({k:etym[k] for k in common})

    print("\n=== Cluster counts (sur nœuds communs) ===")
    print("baseline clusters:", len(base_sizes))
    print("etym clusters:", len(etym_sizes))

    def stats(sizes: Counter):
        vals = sorted(sizes.values(), reverse=True)
        if not vals:
            return {}
        return {
            "max": vals[0],
            "p50": vals[len(vals)//2],
            "p90": vals[max(0, int(0.1*len(vals))-1)],
            "min": vals[-1],
        }

    print("\n=== Size stats (sur nœuds communs) ===")
    print("baseline:", stats(base_sizes))
    print("etym:", stats(etym_sizes))

    print("\n=== Partition similarity (sur nœuds communs) ===")
    print("NMI:", round(nmi(base, etym), 4), "(1=identique)")
    print("VI :", round(vi(base, etym), 4), "(0=identique ; plus haut = plus différent)")

    print("\n=== Top 10 clusters sizes (baseline) ===")
    for cl, sz in base_top:
        print(cl, sz)

    print("\n=== Top 10 clusters sizes (etym) ===")
    for cl, sz in etym_top:
        print(cl, sz)

if __name__ == "__main__":
    main()
