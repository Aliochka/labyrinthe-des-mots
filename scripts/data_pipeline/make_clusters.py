#!/usr/bin/env python3
import json
import argparse
from typing import Dict, Any, Tuple, List
from collections import Counter, defaultdict
import hashlib

import pandas as pd
import igraph as ig

try:
    import leidenalg
except ImportError:
    leidenalg = None


# -----------------------------
# Loading / igraph
# -----------------------------


def load_lemma_graph(path: str) -> Tuple[pd.DataFrame, pd.DataFrame]:
    with open(path, "r", encoding="utf-8") as f:
        raw = json.load(f)

    nodes = pd.DataFrame(raw["nodes"])
    edges = pd.DataFrame(raw["edges"] if "edges" in raw else raw.get("links", []))

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

    # weight is important for Leiden
    g.es["weight"] = e2["weight"].tolist()
    return g


# -----------------------------
# Scenarios (optionnel)
# -----------------------------


def apply_scenario_remove_types(
    nodes: pd.DataFrame, edges: pd.DataFrame, remove: set[str]
) -> Tuple[pd.DataFrame, pd.DataFrame]:
    """
    Même logique que ce que tu faisais : si relationTypeCounts existe, on enlève et on recalcule weight.
    Sinon, on filtre par presence relationTypes et on met weight = len(types restants).
    """
    e2 = edges.copy()

    def has_counts(x):
        return isinstance(x, dict) and len(x) > 0

    if (
        "relationTypeCounts" in e2.columns
        and e2["relationTypeCounts"].apply(has_counts).any()
    ):
        new_counts, new_types, new_weights = [], [], []
        for _, row in e2.iterrows():
            counts = row["relationTypeCounts"]
            if not isinstance(counts, dict):
                counts = {t: 1 for t in (row.get("relationTypes") or [])}
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
        return nodes, e2

    # fallback
    def filt(types):
        if not isinstance(types, list):
            return []
        return [t for t in types if t not in remove]

    if "relationTypes" in e2.columns:
        e2["relationTypes"] = e2["relationTypes"].apply(filt)
        e2 = e2[e2["relationTypes"].apply(lambda x: len(x) > 0)].copy()
        e2["weight"] = e2["relationTypes"].apply(lambda x: float(len(x)))
    return nodes, e2


# -----------------------------
# Galaxy IDs
# -----------------------------


def stable_galaxy_id(prefix: str, members: List[str], use_hash: bool) -> str:
    """
    - Simple: prefix_<leidenClusterId>
    - Stable-hash: prefix_<hash> basé sur la liste triée des membres (plus stable entre runs si renumérotation)
    """
    if not use_hash:
        # caller will pass prefix like "gc_123" already
        return prefix

    # hash on sorted members
    m = sorted(members)
    h = hashlib.blake2b(("|".join(m)).encode("utf-8"), digest_size=6).hexdigest()
    return f"{prefix}_h{h}"


# -----------------------------
# Internal tops
# -----------------------------


def compute_internal_degree_tops(
    edges: pd.DataFrame,
    lemma_to_galaxy: Dict[str, str],
    galaxy_members: Dict[str, List[str]],
    topk: int = 50,
) -> Dict[str, List[str]]:
    """
    Top "internes" = degré interne au sein de la galaxie (compté sur les edges intra-galaxie).
    """
    internal_deg = defaultdict(Counter)  # galaxy -> Counter(lemma -> deg_intra)

    for _, row in edges.iterrows():
        s = row["source"]
        t = row["target"]
        gs = lemma_to_galaxy.get(s)
        gt = lemma_to_galaxy.get(t)
        if not gs or not gt or gs != gt:
            continue
        internal_deg[gs][s] += 1
        internal_deg[gs][t] += 1

    tops: Dict[str, List[str]] = {}
    for g, members in galaxy_members.items():
        c = internal_deg.get(g, Counter())
        if not c:
            # fallback: juste premiers membres
            tops[g] = members[: min(topk, len(members))]
        else:
            tops[g] = [w for w, _ in c.most_common(topk)]
    return tops


# -----------------------------
# Galaxy graph (inter-galaxy edges)
# -----------------------------


def build_galaxy_graph(
    edges: pd.DataFrame,
    lemma_to_galaxy: Dict[str, str],
    min_weight: int = 1,
) -> Dict[str, Any]:
    """
    Construit un graphe agrégé galaxie<->galaxie avec poids = nb d'arêtes lemma inter-galaxies.
    """
    w = Counter()
    for _, row in edges.iterrows():
        s = row["source"]
        t = row["target"]
        gs = lemma_to_galaxy.get(s)
        gt = lemma_to_galaxy.get(t)
        if not gs or not gt or gs == gt:
            continue
        a, b = (gs, gt) if gs < gt else (gt, gs)
        w[(a, b)] += 1

    nodes = sorted(set(lemma_to_galaxy.values()))
    edges_out = []
    for (a, b), cnt in w.items():
        if cnt >= min_weight:
            edges_out.append({"source": a, "target": b, "weight": int(cnt)})

    return {"nodes": [{"id": n} for n in nodes], "edges": edges_out}


# -----------------------------
# Main
# -----------------------------


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--graph", required=True, help="lemma-graph.json")
    ap.add_argument("--out-membership", default="galaxy_membership.jsonl")
    ap.add_argument("--out-galaxies", default="galaxies.json")
    ap.add_argument("--out-galaxy-graph", default="galaxy_graph.json")
    ap.add_argument("--export-galaxy-graph", action="store_true")
    ap.add_argument(
        "--min-galaxy-edge",
        type=int,
        default=2,
        help="min weight for galaxy<->galaxy edges",
    )
    ap.add_argument("--resolution", type=float, default=0.8)
    ap.add_argument("--seed", type=int, default=123)
    ap.add_argument("--topk", type=int, default=50)
    ap.add_argument(
        "--scenario", default="baseline", help="baseline | removeTypes[DERIVATION] etc."
    )
    ap.add_argument(
        "--remove-types",
        default="",
        help="comma separated types to remove (ex: DERIVATION)",
    )
    ap.add_argument(
        "--use-hash-ids",
        action="store_true",
        help="stable galaxy ids based on member-hash",
    )
    args = ap.parse_args()

    if leidenalg is None:
        raise SystemExit("❌ leidenalg non installé. Fais: pip install leidenalg")

    nodes, edges = load_lemma_graph(args.graph)

    # Scenario
    if args.remove_types.strip():
        rm = set([t.strip() for t in args.remove_types.split(",") if t.strip()])
        nodes, edges = apply_scenario_remove_types(nodes, edges, rm)

    g = to_igraph(nodes, edges)
    comps = g.components()
    sizes = comps.sizes()
    if not sizes:
        raise SystemExit("❌ graphe vide")

    # Identify GC + other components
    gc_comp_index = max(range(len(sizes)), key=lambda i: sizes[i])
    gc_vertices = comps[gc_comp_index]
    gc_set = set(gc_vertices)

    ids = g.vs["id"]

    # Build mapping for ALL nodes: default "void" then fill
    lemma_to_galaxy: Dict[str, str] = {}

    # isolates (deg 0) -> void
    deg = g.degree()
    for i, lemma in enumerate(ids):
        if deg[i] == 0:
            lemma_to_galaxy[lemma] = "void"

    # small components (non-GC, non-isolates) -> gc_small_<k>
    small_comp_id = 0
    for ci, verts in enumerate(comps):
        if ci == gc_comp_index:
            continue
        vlist = list(verts)
        if not vlist:
            continue
        # if all isolates, already handled as void
        if all(deg[v] == 0 for v in vlist):
            continue
        gid = f"gc_small_{small_comp_id}"
        small_comp_id += 1
        for v in vlist:
            lemma_to_galaxy[ids[v]] = gid

    # Leiden on GC only
    gc = g.subgraph(list(gc_set))
    try:
        leidenalg.set_rng_seed(args.seed)
    except Exception:
        pass

    part = leidenalg.find_partition(
        gc,
        leidenalg.RBConfigurationVertexPartition,
        weights=gc.es["weight"],
        resolution_parameter=args.resolution,
    )

    # membership on GC
    mem = list(part.membership)
    gc_ids = gc.vs["id"]

    # galaxy members (raw cluster ids)
    raw_members: Dict[int, List[str]] = defaultdict(list)
    for lemma, cid in zip(gc_ids, mem):
        raw_members[int(cid)].append(lemma)

    # assign galaxy ids
    galaxy_members: Dict[str, List[str]] = {}
    for cid, members in raw_members.items():
        base = f"gc_{cid}"
        gid = stable_galaxy_id(base, members, use_hash=args.use_hash_ids)
        galaxy_members[gid] = members
        for lemma in members:
            lemma_to_galaxy[lemma] = gid

    # any remaining nodes not assigned? (shouldn’t happen, but safe)
    for lemma in ids:
        if lemma not in lemma_to_galaxy:
            lemma_to_galaxy[lemma] = "void"

    # internal tops
    tops = compute_internal_degree_tops(
        edges, lemma_to_galaxy, galaxy_members, topk=args.topk
    )

    # write membership jsonl
    with open(args.out_membership, "w", encoding="utf-8") as f:
        for lemma in nodes["lemma"].tolist():
            f.write(
                json.dumps(
                    {"lemma": lemma, "galaxy": lemma_to_galaxy.get(lemma, "void")},
                    ensure_ascii=False,
                )
                + "\n"
            )

    # galaxies summary
    galaxies_out = []
    for gid, members in sorted(
        galaxy_members.items(), key=lambda kv: len(kv[1]), reverse=True
    ):
        galaxies_out.append(
            {
                "galaxy": gid,
                "size": len(members),
                "top": tops.get(gid, [])[: args.topk],
                "sample": members[:50],
            }
        )

    meta = {
        "graph": args.graph,
        "resolution": args.resolution,
        "seed": args.seed,
        "use_hash_ids": bool(args.use_hash_ids),
        "counts": {
            "n_nodes": int(g.vcount()),
            "n_edges": int(g.ecount()),
            "gc_nodes": int(gc.vcount()),
            "gc_edges": int(gc.ecount()),
            "n_galaxies_gc": int(len(galaxy_members)),
            "n_small_components": int(small_comp_id),
            "n_void": int(sum(1 for v in lemma_to_galaxy.values() if v == "void")),
        },
        "galaxies": galaxies_out,
    }

    with open(args.out_galaxies, "w", encoding="utf-8") as f:
        json.dump(meta, f, ensure_ascii=False, indent=2)

    # galaxy graph (for macro layout)
    if args.export_galaxy_graph:
        gg = build_galaxy_graph(edges, lemma_to_galaxy, min_weight=args.min_galaxy_edge)
        with open(args.out_galaxy_graph, "w", encoding="utf-8") as f:
            json.dump(gg, f, ensure_ascii=False, indent=2)

    print("✅ make_clusters terminé")
    print(f"→ membership: {args.out_membership}")
    print(f"→ galaxies:   {args.out_galaxies}")
    if args.export_galaxy_graph:
        print(f"→ galaxy graph: {args.out_galaxy_graph}")


if __name__ == "__main__":
    main()
