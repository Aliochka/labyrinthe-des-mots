#!/usr/bin/env python3
import json
import argparse
import math
import random
from typing import Dict, Any, Tuple, List, Iterable
from collections import defaultdict

import igraph as ig


# ----------------------------
# IO
# ----------------------------


def load_galaxy_membership_jsonl(path: str) -> Dict[str, str]:
    lemma_to_galaxy = {}
    with open(path, "r", encoding="utf-8") as f:
        for line in f:
            if not line.strip():
                continue
            o = json.loads(line)
            lemma_to_galaxy[o["lemma"]] = o["galaxy"]
    return lemma_to_galaxy


def load_lemma_graph(path: str) -> Dict[str, Any]:
    return json.load(open(path, "r", encoding="utf-8"))


def load_galaxy_graph(path: str) -> Dict[str, Any]:
    return json.load(open(path, "r", encoding="utf-8"))


# ----------------------------
# igraph helpers
# ----------------------------


def to_igraph_from_galaxy_graph(gg: Dict[str, Any]) -> ig.Graph:
    nodes = [n["id"] for n in gg.get("nodes", [])]
    idx = {nid: i for i, nid in enumerate(nodes)}

    g = ig.Graph(n=len(nodes), directed=False)
    g.vs["id"] = nodes

    edges = []
    weights = []
    for e in gg.get("edges", []):
        s = e["source"]
        t = e["target"]
        if s not in idx or t not in idx or s == t:
            continue
        edges.append((idx[s], idx[t]))
        weights.append(float(e.get("weight", 1.0)))

    if edges:
        g.add_edges(edges)
        g.es["weight"] = weights
    return g


def to_igraph_subgraph(nodes: List[str], edges: List[Tuple[str, str]]) -> ig.Graph:
    """Undirected graph from list of node ids + edges (u,v) ids."""
    idx = {nid: i for i, nid in enumerate(nodes)}
    g = ig.Graph(n=len(nodes), directed=False)
    g.vs["id"] = nodes

    e_idx = []
    for u, v in edges:
        if u == v:
            continue
        iu = idx.get(u)
        iv = idx.get(v)
        if iu is None or iv is None:
            continue
        e_idx.append((iu, iv))
    if e_idx:
        g.add_edges(e_idx)
    return g


# ----------------------------
# Layout + scaling
# ----------------------------


def layout_drl_3d(g: ig.Graph, seed: int = 123) -> List[List[float]]:
    if g.vcount() == 0:
        return []
    random.seed(seed)
    try:
        coords = g.layout_drl(weights=g.es["weight"] if g.ecount() else None, dim=3)
    except Exception:
        coords = g.layout_drl(dim=3)
    return [list(coords[i]) for i in range(g.vcount())]


def layout_fr_3d(g: ig.Graph, seed: int = 123, niter: int = 200) -> List[List[float]]:
    if g.vcount() == 0:
        return []
    random.seed(seed)
    try:
        coords = g.layout_fruchterman_reingold(dim=3, niter=niter)
    except Exception:
        coords = g.layout_fruchterman_reingold(dim=3)
    return [list(coords[i]) for i in range(g.vcount())]


def coords_to_pos(
    ids: List[str], coords: List[List[float]]
) -> Dict[str, Dict[str, float]]:
    pos = {}
    for i, nid in enumerate(ids):
        x, y, z = coords[i]
        pos[nid] = {"x": float(x), "y": float(y), "z": float(z)}
    return pos


def normalize_positions(
    pos: Dict[str, Dict[str, float]], target_radius: float = 100.0
) -> Dict[str, Dict[str, float]]:
    if not pos:
        return pos

    xs = [p["x"] for p in pos.values()]
    ys = [p["y"] for p in pos.values()]
    zs = [p["z"] for p in pos.values()]
    cx = sum(xs) / len(xs)
    cy = sum(ys) / len(ys)
    cz = sum(zs) / len(zs)

    for p in pos.values():
        p["x"] -= cx
        p["y"] -= cy
        p["z"] -= cz

    maxr = 1e-9
    for p in pos.values():
        r = math.sqrt(p["x"] ** 2 + p["y"] ** 2 + p["z"] ** 2)
        maxr = max(maxr, r)

    k = target_radius / maxr
    for p in pos.values():
        p["x"] *= k
        p["y"] *= k
        p["z"] *= k
    return pos


def median_nearest_neighbor_distance(
    pos: Dict[str, Dict[str, float]], exclude: Iterable[str] = ()
) -> float:
    ids = [k for k in pos.keys() if k not in set(exclude)]
    if len(ids) < 2:
        return 1.0

    def dist(a, b):
        dx = pos[a]["x"] - pos[b]["x"]
        dy = pos[a]["y"] - pos[b]["y"]
        dz = pos[a]["z"] - pos[b]["z"]
        return math.sqrt(dx * dx + dy * dy + dz * dz)

    nn = []
    for i, a in enumerate(ids):
        best = None
        for j, b in enumerate(ids):
            if i == j:
                continue
            d = dist(a, b)
            if best is None or d < best:
                best = d
        if best is not None:
            nn.append(best)

    if not nn:
        return 1.0
    nn.sort()
    return nn[len(nn) // 2]


def sample_sphere(rng: random.Random, radius: float) -> Tuple[float, float, float]:
    theta = rng.random() * 2 * math.pi
    u = 2 * rng.random() - 1
    phi = math.acos(max(-1.0, min(1.0, u)))
    r = radius
    return (
        float(r * math.sin(phi) * math.cos(theta)),
        float(r * math.sin(phi) * math.sin(theta)),
        float(r * math.cos(phi)),
    )


# ----------------------------
# Main
# ----------------------------


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument(
        "--lemma-graph", required=True, help="lemma-graph.json (nodes+edges)"
    )
    ap.add_argument("--membership", required=True, help="galaxy_membership.jsonl")
    ap.add_argument("--galaxy-graph", required=True, help="galaxy_graph.json (macro)")
    ap.add_argument("--out-galaxies-pos", default="positions_galaxies.json")
    ap.add_argument("--out-stars-pos", default="positions_stars.json")
    ap.add_argument("--seed", type=int, default=123)

    # Macro
    ap.add_argument(
        "--macro-radius",
        type=float,
        default=250.0,
        help="radius for galaxy centers (bigger => more separated)",
    )

    # Local layout mode
    ap.add_argument(
        "--local-mode",
        choices=["jitter", "drl", "fr"],
        default="drl",
        help="how to place stars within each galaxy",
    )
    ap.add_argument(
        "--local-max-nodes",
        type=int,
        default=2500,
        help="cap nodes per-galaxy for local layout; above this we fallback to jitter",
    )
    ap.add_argument(
        "--local-fr-iter",
        type=int,
        default=200,
        help="iterations for FR if local-mode=fr",
    )

    # Auto scale
    ap.add_argument(
        "--local-radius-frac",
        type=float,
        default=0.20,
        help="local radius = frac * median NN distance between galaxy centers",
    )

    # Fallback jitter
    ap.add_argument(
        "--jitter-sigma", type=float, default=1.0, help="base sigma for jitter fallback"
    )

    # Void
    ap.add_argument(
        "--void-shell",
        type=float,
        default=600.0,
        help="radius for void stars / satellites",
    )

    args = ap.parse_args()

    rng = random.Random(args.seed)

    lemma_to_galaxy = load_galaxy_membership_jsonl(args.membership)
    raw_lemma = load_lemma_graph(args.lemma_graph)
    gg = load_galaxy_graph(args.galaxy_graph)

    # --- galaxy members
    galaxy_members = defaultdict(list)
    for lemma, gid in lemma_to_galaxy.items():
        galaxy_members[gid].append(lemma)

    # --- macro layout galaxies
    g_macro = to_igraph_from_galaxy_graph(gg)
    coords_macro = layout_drl_3d(g_macro, seed=args.seed)
    pos_gal = coords_to_pos(g_macro.vs["id"], coords_macro)
    pos_gal = normalize_positions(pos_gal, target_radius=args.macro_radius)

    # ensure every galaxy has a position
    for gid in galaxy_members.keys():
        if gid == "void":
            continue
        if gid not in pos_gal:
            x, y, z = sample_sphere(rng, args.void_shell * (0.75 + 0.25 * rng.random()))
            pos_gal[gid] = {"x": x, "y": y, "z": z}

    # --- auto calibrate local radius from galaxy spacing
    med_nn = median_nearest_neighbor_distance(pos_gal, exclude=("void",))
    local_radius = max(5.0, args.local_radius_frac * med_nn)
    print(
        f"[SCALE] median NN between galaxies ~ {med_nn:.3f} → local_radius ~ {local_radius:.3f}"
    )

    # --- build a quick edge list (lemma-graph)
    edges_raw = (
        raw_lemma["edges"] if "edges" in raw_lemma else raw_lemma.get("links", [])
    )
    lemma_edges = [(str(e["source"]), str(e["target"])) for e in edges_raw]

    # For fast filtering edges inside a galaxy: map lemma -> gid then keep (u,v) if same gid
    def gid_of(lemma: str) -> str:
        return lemma_to_galaxy.get(lemma, "void")

    edges_by_galaxy = defaultdict(list)
    for u, v in lemma_edges:
        gu = gid_of(u)
        gv = gid_of(v)
        if gu != gv:
            continue
        if gu == "void":
            continue
        edges_by_galaxy[gu].append((u, v))

    # --- list of all lemmas from lemma-graph nodes (place everyone)
    nodes = raw_lemma["nodes"]
    lemmas = [
        str(n.get("lemma", n.get("id", "")))
        for n in nodes
        if (n.get("lemma") or n.get("id"))
    ]

    # --- local placement
    stars: Dict[str, Dict[str, float]] = {}

    # helper: fallback jitter around center, bounded ~ local_radius
    def place_jitter(lemma: str, center: Dict[str, float], sigma: float):
        h = hash((args.seed, "jitter", lemma)) & 0xFFFFFFFF
        rr = random.Random(h)
        # gaussian + clamp
        dx = rr.gauss(0, sigma)
        dy = rr.gauss(0, sigma)
        dz = rr.gauss(0, sigma)
        # clamp to local_radius (avoid huge tails)
        r = math.sqrt(dx * dx + dy * dy + dz * dz)
        if r > local_radius:
            k = local_radius / (r + 1e-9)
            dx *= k
            dy *= k
            dz *= k
        return {"x": center["x"] + dx, "y": center["y"] + dy, "z": center["z"] + dz}

    # precompute per-galaxy local layouts (optional)
    local_offsets: Dict[
        str, Dict[str, Dict[str, float]]
    ] = {}  # gid -> lemma -> {x,y,z} (centered, scaled)
    if args.local_mode in ("drl", "fr"):
        for gid, members in galaxy_members.items():
            if gid == "void":
                continue
            if len(members) == 0:
                continue

            # too big => fallback jitter to avoid expensive layout
            if len(members) > args.local_max_nodes:
                continue

            # build internal edges for this galaxy
            e = edges_by_galaxy.get(gid, [])
            # if no edges, layout won't help
            if len(e) < 3:
                continue

            g_local = to_igraph_subgraph(members, e)
            if g_local.ecount() == 0 or g_local.vcount() < 2:
                continue

            if args.local_mode == "drl":
                coords = layout_drl_3d(g_local, seed=(args.seed + (hash(gid) & 0xFFFF)))
            else:
                coords = layout_fr_3d(
                    g_local,
                    seed=(args.seed + (hash(gid) & 0xFFFF)),
                    niter=args.local_fr_iter,
                )

            # center + scale to local_radius
            tmp = coords_to_pos(g_local.vs["id"], coords)
            tmp = normalize_positions(tmp, target_radius=local_radius)

            local_offsets[gid] = tmp

        print(
            f"[LOCAL] computed local layouts for {len(local_offsets)} galaxies (mode={args.local_mode})"
        )

    # place stars
    for lemma in lemmas:
        gid = lemma_to_galaxy.get(lemma, "void")

        if gid == "void" or gid not in pos_gal:
            x, y, z = sample_sphere(rng, args.void_shell * (0.9 + 0.2 * rng.random()))
            stars[lemma] = {"x": x, "y": y, "z": z}
            continue

        center = pos_gal[gid]

        # if local layout exists: use it, else jitter fallback
        if gid in local_offsets and lemma in local_offsets[gid]:
            off = local_offsets[gid][lemma]
            stars[lemma] = {
                "x": center["x"] + off["x"],
                "y": center["y"] + off["y"],
                "z": center["z"] + off["z"],
            }
        else:
            stars[lemma] = place_jitter(lemma, center, sigma=args.jitter_sigma)

    with open(args.out_galaxies_pos, "w", encoding="utf-8") as f:
        json.dump(pos_gal, f, ensure_ascii=False, indent=2)

    with open(args.out_stars_pos, "w", encoding="utf-8") as f:
        json.dump(stars, f, ensure_ascii=False, indent=2)

    print("✅ compute_positions_cosmic terminé")
    print(f"→ galaxies pos: {args.out_galaxies_pos}")
    print(f"→ stars pos:    {args.out_stars_pos}")


if __name__ == "__main__":
    main()
