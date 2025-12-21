#!/usr/bin/env python3
import json
import argparse
import random
import math
from dataclasses import dataclass
from typing import Dict, Any, List, Callable, Tuple, Set
from collections import Counter, defaultdict

import igraph as ig
import pandas as pd

try:
    import leidenalg
except ImportError:
    leidenalg = None

try:
    from sklearn.metrics import adjusted_rand_score
except ImportError:
    adjusted_rand_score = None


# ============================================================
# Loading
# ============================================================


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


def filter_isolates(
    nodes: pd.DataFrame, edges: pd.DataFrame
) -> Tuple[pd.DataFrame, pd.DataFrame]:
    """
    Retourne (nodes2, edges2) en supprimant les sommets isolés (degré 0).
    On les détecte via les sommets apparaissant dans au moins un edge.
    """
    if edges.empty:
        return nodes.iloc[0:0].copy(), edges.copy()

    connected = set(edges["source"]).union(set(edges["target"]))
    nodes2 = nodes[nodes["lemma"].isin(connected)].copy()
    edges2 = edges[
        edges["source"].isin(connected) & edges["target"].isin(connected)
    ].copy()
    return nodes2, edges2


def keep_giant_component(
    nodes: pd.DataFrame, edges: pd.DataFrame
) -> Tuple[pd.DataFrame, pd.DataFrame]:
    g = to_igraph(nodes, edges)
    if g.vcount() == 0 or g.ecount() == 0:
        return nodes.iloc[0:0].copy(), edges.iloc[0:0].copy()

    comps = g.components()
    giant_vs = set(g.vs[comps.giant().vs.indices]["id"])

    n2 = nodes[nodes["lemma"].isin(giant_vs)].copy()
    e2 = edges[edges["source"].isin(giant_vs) & edges["target"].isin(giant_vs)].copy()
    return n2, e2


# ============================================================
# Scenarios
# ============================================================


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
    def _t(n, e):
        e2 = e.copy()

        def has_counts(x):
            return isinstance(x, dict) and len(x) > 0

        if e2["relationTypeCounts"].apply(has_counts).any():
            new_counts, new_types, new_weights = [], [], []

            for _, row in e2.iterrows():
                counts = row["relationTypeCounts"]
                if not isinstance(counts, dict):
                    counts = {t: 1 for t in (row["relationTypes"] or [])}

                kept = {k: v for k, v in counts.items() if k not in remove}
                w = float(sum(kept.values()))
                if w > 0:
                    new_counts.append(kept)
                    new_types.append(sorted(kept.keys()))
                    new_weights.append(w)
                else:
                    new_counts.append(None)
                    new_types.append([])
                    new_weights.append(0.0)

            e2["relationTypeCounts"] = new_counts
            e2["relationTypes"] = new_types
            e2["weight"] = new_weights
            e2 = e2[e2["weight"] > 0].copy()
            return n, e2

        # fallback: recompute weight from remaining types
        def filt(types):
            if not isinstance(types, list):
                return []
            return [t for t in types if t not in remove]

        e2["relationTypes"] = e2["relationTypes"].apply(filt)
        e2 = e2[e2["relationTypes"].apply(lambda x: len(x) > 0)].copy()
        e2["weight"] = e2["relationTypes"].apply(lambda x: float(len(x)))
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


# ============================================================
# Metrics
# ============================================================


def approx_distances_on_lcc(g: ig.Graph, samples: int = 1000, seed: int = 123):
    random.seed(seed)
    if g.vcount() < 2 or g.ecount() == 0:
        return {"avg_path_lcc": None, "diameter_lcc": None}

    lcc = g.components().giant()
    if lcc.vcount() < 2 or lcc.ecount() == 0:
        return {"avg_path_lcc": None, "diameter_lcc": None}

    vs = list(range(lcc.vcount()))
    sources = random.sample(vs, k=min(samples, len(vs)))

    dists_all, diam = [], 0
    for s in sources:
        row = lcc.distances(source=s)[0]
        for d in row:
            if d and not math.isinf(d):
                dists_all.append(d)
                diam = max(diam, d)

    avg = sum(dists_all) / len(dists_all) if dists_all else None
    return {"avg_path_lcc": avg, "diameter_lcc": diam if dists_all else None}


def compute_metrics(nodes: pd.DataFrame, edges: pd.DataFrame) -> Dict[str, Any]:
    g = to_igraph(nodes, edges)

    deg = g.degree()
    deg_sorted = sorted(deg)

    def pct(p):
        if not deg_sorted:
            return 0
        i = int((p / 100) * (len(deg_sorted) - 1))
        return deg_sorted[i]

    comps = g.components()
    comp_sizes = comps.sizes()

    dist = approx_distances_on_lcc(g)

    return {
        "n_nodes": g.vcount(),
        "n_edges": g.ecount(),
        "n_components": len(comp_sizes),
        "lcc_size": max(comp_sizes) if comp_sizes else 0,
        "lcc_ratio": (max(comp_sizes) / g.vcount()) if g.vcount() else 0,
        "isolates": sum(1 for d in deg if d == 0),
        "deg_p50": pct(50),
        "deg_p95": pct(95),
        "deg_max": max(deg) if deg else 0,
        "avg_path_lcc": dist["avg_path_lcc"],
        "diameter_lcc": dist["diameter_lcc"],
    }


# ============================================================
# Leiden + clustering
# ============================================================


def leiden_partition(g: ig.Graph, resolution: float, seed: int):
    if not leidenalg or g.vcount() == 0 or g.ecount() == 0:
        return None
    try:
        leidenalg.set_rng_seed(seed)
    except Exception:
        pass
    return leidenalg.find_partition(
        g,
        leidenalg.RBConfigurationVertexPartition,
        weights=g.es["weight"],
        resolution_parameter=resolution,
    )


def cluster_stats(membership: List[int], n_nodes: int) -> Dict[str, Any]:
    sizes = list(Counter(membership).values())
    sizes.sort()
    n = len(sizes)
    if n == 0:
        return {
            "n_clusters": 0,
            "cluster_size_p50": None,
            "cluster_size_p90": None,
            "cluster_size_p99": None,
            "cluster_size_max": 0,
            "cluster_singletons": 0,
            "cluster_singletons_ratio": 0.0,
            "max_cluster_ratio": 0.0,
        }

    def pct(p):
        return sizes[int((p / 100) * (n - 1))]

    singletons = sum(1 for s in sizes if s == 1)
    max_size = sizes[-1]

    return {
        "n_clusters": n,
        "cluster_size_p50": pct(50),
        "cluster_size_p90": pct(90),
        "cluster_size_p99": pct(99),
        "cluster_size_max": max_size,
        "cluster_singletons": singletons,
        "cluster_singletons_ratio": singletons / n,
        "max_cluster_ratio": (max_size / n_nodes) if n_nodes else 0.0,
    }


def perturb_edges(edges: pd.DataFrame, frac: float, seed: int):
    if edges.empty:
        return edges
    rng = random.Random(seed)
    k = int(len(edges) * frac)
    drop = rng.sample(list(edges.index), k=min(k, len(edges)))
    return edges.drop(drop).copy()


def ari(m1, m2):
    if adjusted_rand_score is None or len(m1) != len(m2):
        return None
    return float(adjusted_rand_score(m1, m2))


# ============================================================
# Export helpers (GC)
# ============================================================


def compute_gc_top_internal_degree(
    g_gc: ig.Graph, mem_gc: List[int], top_k: int = 50
) -> Dict[str, List[str]]:
    """
    For each cluster id in mem_gc, compute 'top' lemmas by INTERNAL degree within the cluster.
    Returns: { "cluster_id": [lemma1, lemma2, ...] }
    """
    cid_to_vids: Dict[int, List[int]] = defaultdict(list)
    for vid, cid in enumerate(mem_gc):
        cid_to_vids[int(cid)].append(vid)

    top_terms: Dict[str, List[str]] = {}
    for cid, vids in cid_to_vids.items():
        if len(vids) == 0:
            top_terms[str(cid)] = []
            continue

        sub = g_gc.subgraph(vids)
        deg = sub.degree()  # internal degree in induced subgraph

        ranked = sorted(range(sub.vcount()), key=lambda i: deg[i], reverse=True)[:top_k]
        top_terms[str(cid)] = [sub.vs[i]["id"] for i in ranked]

    return top_terms


# ============================================================
# Runner
# ============================================================


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--graph", required=True)
    ap.add_argument("--out", default="graph_benchmark.csv")
    ap.add_argument("--report", default="graph_benchmark_report.json")
    ap.add_argument("--resolution-grid", default="0.5,0.8,1.0,1.2")
    ap.add_argument("--stability-drops", default="0.05,0.10")
    ap.add_argument("--seed", type=int, default=123)
    ap.add_argument("--preview-clusters", type=int, default=0)
    ap.add_argument("--clusters-out", default="clusters_preview.json")
    ap.add_argument(
        "--export-gc", action="store_true", help="Export GC membership mapping"
    )
    ap.add_argument("--gc-membership-out", default="gc_membership.jsonl")
    ap.add_argument("--gc-clusters-out", default="gc_clusters.json")
    ap.add_argument(
        "--gc-sample-k",
        type=int,
        default=50,
        help="How many lemmas per cluster to export",
    )
    ap.add_argument(
        "--gc-top-k",
        type=int,
        default=50,
        help="How many TOP internal-degree lemmas per cluster to export",
    )

    args = ap.parse_args()

    nodes, edges = load_lemma_graph(args.graph)

    # Keep it focused: only the chosen winner scenario by default
    scenarios = [
        scen_remove_types({"DERIVATION"}),
    ]

    resolutions = [float(x) for x in args.resolution_grid.split(",")]
    drops = [float(x) for x in args.stability_drops.split(",")]

    rows = []
    report = {"scenarios": []}
    previews = {}

    for sc in scenarios:
        n2, e2 = sc.transform(nodes, edges)
        g = to_igraph(n2, e2)
        base_metrics = compute_metrics(n2, e2)

        # version sans isolés (pour stats cluster plus pertinentes)
        n2_ni, e2_ni = filter_isolates(n2, e2)
        g_ni = to_igraph(n2_ni, e2_ni)
        n_nodes_ni = g_ni.vcount()

        # version giant component (coeur explorable)
        n2_gc, e2_gc = keep_giant_component(n2, e2)
        g_gc = to_igraph(n2_gc, e2_gc)
        n_nodes_gc = g_gc.vcount()

        scen_entry = {"scenario": sc.name, "leiden": []}

        for res in resolutions:
            part = leiden_partition(g, res, args.seed)
            if not part:
                continue

            mem = list(part.membership)
            cstats = cluster_stats(mem, g.vcount())

            # stats clusters sans isolés (mêmes paramètres Leiden)
            part_ni = (
                leiden_partition(g_ni, res, args.seed)
                if n_nodes_ni > 0 and g_ni.ecount() > 0
                else None
            )
            if part_ni:
                mem_ni = list(part_ni.membership)
                cstats_ni = cluster_stats(mem_ni, n_nodes_ni)
            else:
                cstats_ni = {
                    "n_clusters": 0,
                    "cluster_size_p50": None,
                    "cluster_size_p90": None,
                    "cluster_size_p99": None,
                    "cluster_size_max": 0,
                    "cluster_singletons": 0,
                    "cluster_singletons_ratio": 0.0,
                    "max_cluster_ratio": 0.0,
                }

            cstats_ni = {f"nonisol_{k}": v for k, v in cstats_ni.items()}
            cstats_ni["n_nodes_nonisolated"] = n_nodes_ni

            # stats clusters sur la giant component
            part_gc = (
                leiden_partition(g_gc, res, args.seed)
                if n_nodes_gc > 0 and g_gc.ecount() > 0
                else None
            )
            if part_gc:
                mem_gc = list(part_gc.membership)
                cstats_gc_plain = cluster_stats(mem_gc, n_nodes_gc)
            else:
                mem_gc = []
                cstats_gc_plain = {
                    "n_clusters": 0,
                    "cluster_size_p50": None,
                    "cluster_size_p90": None,
                    "cluster_size_p99": None,
                    "cluster_size_max": 0,
                    "cluster_singletons": 0,
                    "cluster_singletons_ratio": 0.0,
                    "max_cluster_ratio": 0.0,
                }

            cstats_gc = {f"gc_{k}": v for k, v in cstats_gc_plain.items()}
            cstats_gc["n_nodes_giant"] = n_nodes_gc

            # --- Optional export GC membership + cluster summaries ---
            if args.export_gc and part_gc:
                ids_gc = g_gc.vs["id"]

                # membership mapping lemma -> cluster_id (GC only)
                with open(args.gc_membership_out, "w", encoding="utf-8") as f:
                    for lemma, cid in zip(ids_gc, mem_gc):
                        f.write(
                            json.dumps(
                                {
                                    "scenario": sc.name,
                                    "resolution": res,
                                    "lemma": lemma,
                                    "gc_cluster": int(cid),
                                },
                                ensure_ascii=False,
                            )
                            + "\n"
                        )

                # group lemmas by cluster id
                sizes = Counter(mem_gc)
                clusters: Dict[int, List[str]] = {}
                for i, cid in enumerate(mem_gc):
                    clusters.setdefault(int(cid), []).append(ids_gc[i])

                # compute TOP internal-degree lemmas per cluster (best for naming)
                top_terms = compute_gc_top_internal_degree(
                    g_gc, mem_gc, top_k=args.gc_top_k
                )

                # build output with random sample + top list
                rng = random.Random(args.seed)
                clusters_out: Dict[str, Dict[str, Any]] = {}

                for cid in sorted(sizes, key=lambda c: sizes[c], reverse=True):
                    lst = clusters[int(cid)].copy()
                    rng.shuffle(lst)
                    clusters_out[str(cid)] = {
                        "size": int(sizes[cid]),
                        "sample": lst[: args.gc_sample_k],
                        "top": top_terms.get(str(cid), [])[: args.gc_top_k],
                    }

                summary = {
                    "scenario": sc.name,
                    "resolution": res,
                    "n_nodes_giant": n_nodes_gc,
                    "n_clusters": len(sizes),
                    "clusters": clusters_out,
                }

                with open(args.gc_clusters_out, "w", encoding="utf-8") as f:
                    json.dump(summary, f, ensure_ascii=False, indent=2)

            # stability (on full graph of scenario)
            stability = {}
            for d in drops:
                e_p = perturb_edges(e2, d, args.seed)
                g_p = to_igraph(n2, e_p)
                part2 = leiden_partition(g_p, res, args.seed)
                stability[f"ARI_drop_{d}"] = (
                    ari(mem, list(part2.membership)) if part2 else None
                )

            row = {
                "scenario": sc.name,
                "resolution": res,
                "modularity": part.modularity,
                **base_metrics,
                **cstats,
                **cstats_ni,
                **cstats_gc,
                **stability,
            }
            rows.append(row)
            scen_entry["leiden"].append(row)

            # lightweight preview (optional)
            if args.preview_clusters > 0:
                sizes_full = Counter(mem)
                top = sizes_full.most_common(args.preview_clusters)
                inv = {}
                ids = g.vs["id"]
                top_set = set(cid for cid, _ in top)
                for i, cid in enumerate(mem):
                    if cid in top_set:
                        inv.setdefault(cid, []).append(ids[i])
                previews.setdefault(sc.name, {})[str(res)] = {
                    "sizes": dict(top),
                    "clusters": {str(k): v[:200] for k, v in inv.items()},
                }

        report["scenarios"].append(scen_entry)

    df = pd.DataFrame(rows)
    df.to_csv(args.out, index=False)

    with open(args.report, "w", encoding="utf-8") as f:
        json.dump(report, f, ensure_ascii=False, indent=2)

    if args.preview_clusters > 0:
        with open(args.clusters_out, "w", encoding="utf-8") as f:
            json.dump(previews, f, ensure_ascii=False, indent=2)

    print("✅ Benchmark terminé")
    if not df.empty:
        print(df.sort_values(["scenario", "resolution"]).to_string(index=False))
    else:
        print("⚠️ Aucun résultat (leidenalg absent ? graphe vide ?)")


if __name__ == "__main__":
    main()
