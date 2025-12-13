#!/usr/bin/env python3
import json
import argparse
from dataclasses import dataclass
from typing import Dict, Any, List, Callable, Tuple, Set, Optional
import random
import math

import igraph as ig
import pandas as pd

try:
    import leidenalg
except ImportError:
    leidenalg = None


# ----------------- Loading -----------------


def load_lemma_graph(path: str) -> Tuple[pd.DataFrame, pd.DataFrame]:
    with open(path, "r", encoding="utf-8") as f:
        raw = json.load(f)

    nodes = pd.DataFrame(raw["nodes"])
    edges = pd.DataFrame(raw["edges"])

    if "lemma" not in nodes.columns:
        raise ValueError("nodes must have 'lemma'")
    if "source" not in edges.columns or "target" not in edges.columns:
        raise ValueError("edges must have 'source' and 'target'")

    if "weight" not in edges.columns:
        edges["weight"] = 1.0
    if "relationTypes" not in edges.columns:
        edges["relationTypes"] = [[] for _ in range(len(edges))]
    if "relationTypeCounts" not in edges.columns:
        edges["relationTypeCounts"] = [None for _ in range(len(edges))]

    nodes["lemma"] = nodes["lemma"].astype(str)
    edges["source"] = edges["source"].astype(str)
    edges["target"] = edges["target"].astype(str)
    edges["weight"] = edges["weight"].astype(float)

    return nodes, edges


def to_igraph(nodes: pd.DataFrame, edges: pd.DataFrame) -> ig.Graph:
    ids = nodes["lemma"].tolist()
    idx = {v: i for i, v in enumerate(ids)}

    e2 = edges[edges["source"].isin(idx) & edges["target"].isin(idx)].copy()

    g = ig.Graph(n=len(ids), directed=False)
    g.vs["id"] = ids
    g.add_edges(list(zip(e2["source"].map(idx), e2["target"].map(idx))))

    g.es["weight"] = e2["weight"].tolist()
    g.es["relationTypes"] = e2["relationTypes"].tolist()
    g.es["relationTypeCounts"] = e2["relationTypeCounts"].tolist()

    return g


# ----------------- Scenarios -----------------


@dataclass
class Scenario:
    name: str
    transform: Callable[[pd.DataFrame, pd.DataFrame], Tuple[pd.DataFrame, pd.DataFrame]]


def scen_baseline() -> Scenario:
    return Scenario("baseline", lambda n, e: (n, e))


def scen_weight_ge(th: float) -> Scenario:
    def _t(n, e):
        return n, e[e["weight"] >= th].copy()

    return Scenario(f"weight>={th}", _t)


def scen_remove_types(remove: Set[str]) -> Scenario:
    """
    Accurate if relationTypeCounts exists:
    - Remove types from relationTypeCounts
    - Recompute weight = sum(remaining counts)
    - Drop edge if weight==0

    Fallback if missing:
    - Presence-based on relationTypes (keeps original weight)
    """

    def _t(n, e):
        e2 = e.copy()

        def _has_counts(x):
            return isinstance(x, dict) and len(x) > 0

        if e2["relationTypeCounts"].apply(_has_counts).any():
            new_counts = []
            new_types = []
            new_weights = []

            for _, row in e2.iterrows():
                counts = row["relationTypeCounts"]
                if not isinstance(counts, dict):
                    counts = {t: 1 for t in (row["relationTypes"] or [])}

                kept = {k: v for k, v in counts.items() if k not in remove}
                w = float(sum(kept.values()))
                if w <= 0:
                    new_counts.append(None)
                    new_types.append([])
                    new_weights.append(0.0)
                else:
                    new_counts.append(kept)
                    new_types.append(sorted(kept.keys()))
                    new_weights.append(w)

            e2["relationTypeCounts"] = new_counts
            e2["relationTypes"] = new_types
            e2["weight"] = new_weights
            e2 = e2[e2["weight"] > 0].copy()
            return n, e2

        # fallback presence-based
        def filt(types):
            if not isinstance(types, list):
                return []
            return [t for t in types if t not in remove]

        e2["relationTypes"] = e2["relationTypes"].apply(filt)
        e2 = e2[e2["relationTypes"].apply(lambda lst: len(lst) > 0)].copy()
        return n, e2

    lab = ",".join(sorted(remove))
    return Scenario(f"removeTypes[{lab}]", _t)


def scen_drop_top_degree(frac: float) -> Scenario:
    def _t(n, e):
        g = to_igraph(n, e)
        deg = g.degree()
        ids = g.vs["id"]

        k = max(1, int(len(ids) * frac))
        top_idx = sorted(range(len(ids)), key=lambda i: deg[i], reverse=True)[:k]
        drop = set(ids[i] for i in top_idx)

        n2 = n[~n["lemma"].isin(drop)].copy()
        e2 = e[~e["source"].isin(drop) & ~e["target"].isin(drop)].copy()
        return n2, e2

    return Scenario(f"dropTopDegree[{frac:.3f}]", _t)


# ----------------- Metrics & Rankings -----------------


def approx_distances_on_lcc(
    g: ig.Graph, samples: int = 1000, seed: int = 123
) -> Dict[str, Any]:
    random.seed(seed)

    if g.vcount() < 2 or g.ecount() == 0:
        return {"avg_path_lcc": None, "diameter_lcc": None}

    comps = g.components()
    lcc = comps.giant()
    if lcc.vcount() < 2 or lcc.ecount() == 0:
        return {"avg_path_lcc": None, "diameter_lcc": None}

    vs = list(range(lcc.vcount()))
    sources = random.sample(vs, k=min(samples, len(vs)))

    dists_all = []
    diam = 0

    # Use distances() to avoid deprecated shortest_paths()
    for s in sources:
        row = lcc.distances(source=s, weights=None)[0]
        for d in row:
            if d is None:
                continue
            if d > 0 and not math.isinf(d):
                dists_all.append(d)
                if d > diam:
                    diam = d

    avg = (sum(dists_all) / len(dists_all)) if dists_all else None
    return {"avg_path_lcc": avg, "diameter_lcc": (diam if dists_all else None)}


def top_degree(g: ig.Graph, k: int = 20) -> List[Dict[str, Any]]:
    deg = g.degree()
    ids = g.vs["id"]
    ranked = sorted(range(g.vcount()), key=lambda i: deg[i], reverse=True)[:k]
    return [{"lemma": ids[i], "degree": int(deg[i])} for i in ranked]


def top_bridges_betweenness_approx(
    g: ig.Graph, k: int = 20, sample: int = 4000, seed: int = 123
) -> List[Dict[str, Any]]:
    """
    Approx betweenness by sampling vertices (igraph supports 'cutoff' and 'sources/targets' in some versions,
    but compatibility varies). We'll do a pragmatic approximation:

    - Take LCC
    - Sample a subset of vertices
    - Compute betweenness on the induced subgraph (fast-ish) and map back

    This is not exact but gives useful "bridge-like" nodes for comparison across scenarios.
    """
    random.seed(seed)

    if g.vcount() < 5 or g.ecount() == 0:
        return []

    comps = g.components()
    lcc = comps.giant()
    if lcc.vcount() < 5 or lcc.ecount() == 0:
        return []

    # sample vertices in LCC
    n = lcc.vcount()
    take = min(sample, n)
    verts = random.sample(list(range(n)), k=take)

    sub = lcc.subgraph(verts)

    # betweenness on subgraph
    try:
        btw = sub.betweenness(directed=False, weights=None)
    except Exception:
        btw = sub.betweenness()

    ids = sub.vs["id"]
    ranked = sorted(range(sub.vcount()), key=lambda i: btw[i], reverse=True)[:k]
    return [{"lemma": ids[i], "betweenness": float(btw[i])} for i in ranked]


def compute_metrics(nodes: pd.DataFrame, edges: pd.DataFrame) -> Dict[str, Any]:
    g = to_igraph(nodes, edges)

    n = g.vcount()
    m = g.ecount()

    deg = g.degree()
    deg_sorted = sorted(deg)

    def pct(p):
        if not deg_sorted:
            return 0
        i = int((p / 100) * (len(deg_sorted) - 1))
        return deg_sorted[i]

    comps = g.components()
    comp_sizes = comps.sizes()
    n_comp = len(comp_sizes)
    lcc_size = max(comp_sizes) if comp_sizes else 0

    isolates = sum(1 for d in deg if d == 0)

    # clustering on LCC
    clustering_lcc = None
    lcc = comps.giant() if n > 0 and m > 0 else None
    if lcc and lcc.vcount() > 2 and lcc.ecount() > 0:
        try:
            clustering_lcc = lcc.transitivity_avglocal_undirected(mode="zero")
        except Exception:
            clustering_lcc = None

    # k-core
    max_kcore = None
    if n > 0 and m > 0:
        try:
            max_kcore = max(g.coreness())
        except Exception:
            max_kcore = None

    # Leiden on LCC (optional)
    leiden_mod = None
    leiden_n_comm = None
    if leidenalg and lcc and lcc.vcount() > 2 and lcc.ecount() > 0:
        try:
            part = leidenalg.find_partition(
                lcc,
                leidenalg.RBConfigurationVertexPartition,
                weights=lcc.es["weight"],
                resolution_parameter=1.0,
            )
            leiden_mod = part.modularity
            leiden_n_comm = len(part)
        except Exception:
            pass

    dist = approx_distances_on_lcc(g, samples=1000)

    # relation type coverage (edge mentions)
    type_counts: Dict[str, int] = {}
    for types in edges["relationTypes"].tolist():
        if not isinstance(types, list):
            continue
        for t in types:
            type_counts[t] = type_counts.get(t, 0) + 1
    top_types = sorted(type_counts.items(), key=lambda x: x[1], reverse=True)[:10]
    top_types_str = ";".join([f"{k}:{v}" for k, v in top_types])

    return {
        "n_nodes": n,
        "n_edges": m,
        "n_components": n_comp,
        "lcc_size": lcc_size,
        "lcc_ratio": (lcc_size / n) if n else 0,
        "isolates": isolates,
        "deg_p50": pct(50),
        "deg_p95": pct(95),
        "deg_max": max(deg) if deg else 0,
        "clustering_lcc": clustering_lcc,
        "max_kcore": max_kcore,
        "avg_path_lcc": dist["avg_path_lcc"],
        "diameter_lcc": dist["diameter_lcc"],
        "leiden_modularity_lcc": leiden_mod,
        "leiden_n_comm_lcc": leiden_n_comm,
        "top_relationTypes": top_types_str,
    }


# ----------------- Runner -----------------


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--graph", required=True, help="path to lemma-graph.json")
    ap.add_argument("--out", default="graph_benchmark.csv", help="CSV output path")
    ap.add_argument(
        "--report",
        default="graph_benchmark_report.json",
        help="JSON report output path",
    )
    ap.add_argument("--bridges", type=int, default=20, help="top-k bridges to export")
    ap.add_argument("--hubs", type=int, default=20, help="top-k hubs to export")
    ap.add_argument(
        "--bridge-sample",
        type=int,
        default=4000,
        help="LCC vertex sample size for betweenness approx",
    )
    args = ap.parse_args()

    nodes, edges = load_lemma_graph(args.graph)

    scenarios: List[Scenario] = [
        scen_baseline(),
        scen_weight_ge(2),
        scen_weight_ge(3),
        scen_remove_types({"ANTONYM"}),
        scen_remove_types({"DERIVATION"}),
        scen_remove_types({"PERTAINYM"}),
        scen_remove_types(
            {"HYPERNYM", "HYPONYM", "INSTANCE_HYPERNYM", "INSTANCE_HYPONYM"}
        ),
        scen_remove_types(
            {
                "PART_MERONYM",
                "MEMBER_MERONYM",
                "SUBSTANCE_MERONYM",
                "PART_HOLONYM",
                "MEMBER_HOLONYM",
                "SUBSTANCE_HOLONYM",
            }
        ),
        scen_drop_top_degree(0.001),
        scen_drop_top_degree(0.005),
    ]

    rows = []
    report: Dict[str, Any] = {
        "input_graph": args.graph,
        "outputs": {"csv": args.out, "json": args.report},
        "leiden_available": bool(leidenalg),
        "scenarios": [],
    }

    for sc in scenarios:
        n2, e2 = sc.transform(nodes, edges)
        g = to_igraph(n2, e2)

        met = compute_metrics(n2, e2)
        met["scenario"] = sc.name
        rows.append(met)

        scen_entry = {
            "scenario": sc.name,
            "metrics": met,
            "top_hubs_degree": top_degree(g, k=args.hubs),
            "top_bridges_betweenness_approx": top_bridges_betweenness_approx(
                g, k=args.bridges, sample=args.bridge_sample, seed=123
            ),
        }
        report["scenarios"].append(scen_entry)

    df = pd.DataFrame(rows)
    df = df[["scenario"] + [c for c in df.columns if c != "scenario"]]
    df.to_csv(args.out, index=False)

    with open(args.report, "w", encoding="utf-8") as f:
        json.dump(report, f, ensure_ascii=False, indent=2)

    print("✅ Benchmark terminé")
    print(df.sort_values("lcc_size", ascending=False).to_string(index=False))
    print(f"\n→ CSV: {args.out}")
    print(f"→ JSON: {args.report}")

    if not leidenalg:
        print(
            "\nℹ️  leidenalg non installé : modularité/communautés sautées. "
            "Installe: pip install leidenalg"
        )


if __name__ == "__main__":
    main()
