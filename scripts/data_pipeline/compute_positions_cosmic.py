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
            lemma_to_galaxy[str(o["lemma"])] = str(o["galaxy"])
    return lemma_to_galaxy


def load_lemma_graph(path: str) -> Dict[str, Any]:
    return json.load(open(path, "r", encoding="utf-8"))


def load_galaxy_graph(path: str) -> Dict[str, Any]:
    return json.load(open(path, "r", encoding="utf-8"))


# ----------------------------
# igraph helpers
# ----------------------------

def to_igraph_from_galaxy_graph(gg: Dict[str, Any]) -> ig.Graph:
    nodes = [str(n["id"]) for n in gg.get("nodes", [])]
    idx = {nid: i for i, nid in enumerate(nodes)}

    g = ig.Graph(n=len(nodes), directed=False)
    g.vs["id"] = nodes

    edges = []
    weights = []
    for e in gg.get("edges", []):
        s = str(e["source"])
        t = str(e["target"])
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


def coords_to_pos(ids: List[str], coords: List[List[float]]) -> Dict[str, Dict[str, float]]:
    pos = {}
    for i, nid in enumerate(ids):
        x, y, z = coords[i]
        pos[nid] = {"x": float(x), "y": float(y), "z": float(z)}
    return pos


def normalize_positions(pos: Dict[str, Dict[str, float]], target_radius: float = 100.0) -> Dict[str, Dict[str, float]]:
    """Center positions and scale so max radius == target_radius."""
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


def median_nearest_neighbor_distance(pos: Dict[str, Dict[str, float]], exclude: Iterable[str] = ()) -> float:
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
    """Uniform random direction on sphere with fixed radius."""
    theta = rng.random() * 2 * math.pi
    u = 2 * rng.random() - 1
    phi = math.acos(max(-1.0, min(1.0, u)))
    r = radius
    return (
        float(r * math.sin(phi) * math.cos(theta)),
        float(r * math.sin(phi) * math.sin(theta)),
        float(r * math.cos(phi)),
    )


def edge_has_type(e: Dict[str, Any], t: str) -> bool:
    rts = e.get("relationTypes") or e.get("relationType") or []
    if isinstance(rts, str):
        rts = [rts]
    return t in set(rts)


# ----------------------------
# Main
# ----------------------------

def main():
    ap = argparse.ArgumentParser()

    ap.add_argument("--lemma-graph", required=True, help="lemma-graph.json (nodes+edges)")
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
        "--intra-layout",
        choices=["jitter", "drl", "fr"],
        default="drl",
        help="how to place stars within each galaxy",
    )
    ap.add_argument(
        "--max-intra-layout",
        type=int,
        default=2500,
        help="cap nodes per-galaxy for local layout; above this we fallback to jitter",
    )
    ap.add_argument(
        "--local-fr-iter",
        type=int,
        default=200,
        help="iterations for FR if intra-layout=fr",
    )

    # Per-galaxy radius scaling (recommended)
    ap.add_argument("--galaxy-radius-base", type=float, default=10.0)
    ap.add_argument("--galaxy-radius-exp", type=float, default=0.35)
    ap.add_argument("--galaxy-radius-max", type=float, default=60.0)

    # Optional global auto scale (fallback if you don't want per-galaxy)
    ap.add_argument(
        "--local-radius-frac",
        type=float,
        default=0.20,
        help="(fallback) local radius = frac * median NN distance between galaxy centers",
    )

    # Fallback jitter
    ap.add_argument("--jitter-sigma", type=float, default=1.0, help="base sigma for jitter fallback")

    # Void
    ap.add_argument("--void-shell", type=float, default=600.0, help="radius for void stars / satellites")

    # Behavior flags
    ap.add_argument(
        "--exclude-etymology",
        action="store_true",
        help="ignore ETYMOLOGY edges for intra layouts (recommended)",
    )
    ap.add_argument(
        "--satellite-external",
        action="store_true",
        default=True,
        help="place etym_external nodes as satellites near their WordNet anchors (default: true)",
    )
    ap.add_argument(
        "--macro-spread-exp",
        type=float,
        default=0.6,
        help="radial expansion for macro layout (<1 spreads galaxies outward)",
    )


    args = ap.parse_args()
    rng = random.Random(args.seed)

    lemma_to_galaxy = load_galaxy_membership_jsonl(args.membership)
    raw_lemma = load_lemma_graph(args.lemma_graph)
    gg = load_galaxy_graph(args.galaxy_graph)

    # --- Build node_kind index to detect etym_external
    node_kind: Dict[str, str] = {}
    lemmas_all: List[str] = []
    for n in raw_lemma.get("nodes", []):
        lid = str(n.get("lemma", n.get("id", "")))
        if not lid:
            continue
        lemmas_all.append(lid)
        node_kind[lid] = str(n.get("kind", "wordnet"))

    def is_external(lemma: str) -> bool:
        return node_kind.get(lemma) == "etym_external"

    def is_wordnet(lemma: str) -> bool:
        return not is_external(lemma)

    # --- galaxy members (WordNet only — externals aren't in membership)
    galaxy_members = defaultdict(list)
    for lemma, gid in lemma_to_galaxy.items():
        galaxy_members[gid].append(lemma)

    # --- macro layout galaxies
    g_macro = to_igraph_from_galaxy_graph(gg)
    coords_macro = layout_drl_3d(g_macro, seed=args.seed)
    pos_gal = coords_to_pos(g_macro.vs["id"], coords_macro)
    pos_gal = normalize_positions(pos_gal, target_radius=args.macro_radius)
    # --- macro radial expansion (spread galaxies outward)
    if args.macro_spread_exp != 1.0:
        for p in pos_gal.values():
            r = math.sqrt(p["x"]**2 + p["y"]**2 + p["z"]**2)
            if r < 1e-9:
                continue
            rn = r / args.macro_radius
            rn2 = rn ** args.macro_spread_exp
            k = (rn2 * args.macro_radius) / r
            p["x"] *= k
            p["y"] *= k
            p["z"] *= k


    # ensure every galaxy has a position (incl gc_small_* that might not be in galaxy_graph)
    for gid in galaxy_members.keys():
        if gid == "void":
            continue
        if gid not in pos_gal:
            x, y, z = sample_sphere(rng, args.void_shell * (0.75 + 0.25 * rng.random()))
            pos_gal[gid] = {"x": x, "y": y, "z": z}

    # --- optional: global spacing metric (used only if you want to reason about global scales)
    med_nn = median_nearest_neighbor_distance(pos_gal, exclude=("void",))
    global_local_radius = max(5.0, args.local_radius_frac * med_nn)
    print(f"[SCALE] median NN between galaxies ~ {med_nn:.3f} → global_local_radius ~ {global_local_radius:.3f}")

    # --- per-galaxy local radius
    galaxy_local_radius: Dict[str, float] = {}
    for gid, members in galaxy_members.items():
        if gid == "void":
            continue
        r = args.galaxy_radius_base * (max(1, len(members)) ** args.galaxy_radius_exp)
        r = min(args.galaxy_radius_max, max(3.0, r))
        galaxy_local_radius[gid] = r

    # --- build edge lists
    edges_raw = raw_lemma.get("edges") or raw_lemma.get("links") or []
    lemma_edges: List[Tuple[str, str]] = []
    etym_edges: List[Tuple[str, str]] = []

    for e in edges_raw:
        u = str(e.get("source"))
        v = str(e.get("target"))
        if not u or not v or u == v:
            continue

        # separate etymology edges for satellite placement
        if edge_has_type(e, "ETYMOLOGY"):
            etym_edges.append((u, v))
            if args.exclude_etymology:
                continue  # don't include in lemma_edges
            # If exclude-etymology is false, still avoid externals in intra layouts
            if is_external(u) or is_external(v):
                continue
            lemma_edges.append((u, v))
            continue

        # ignore edges involving externals for semantic intra layouts
        if is_external(u) or is_external(v):
            continue

        lemma_edges.append((u, v))

    # --- edges grouped by galaxy (WordNet only, same gid)
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

    # --- local placement
    stars: Dict[str, Dict[str, float]] = {}

    def place_jitter(lemma: str, center: Dict[str, float], radius: float, sigma: float):
        """Stable jitter around a center, clamped to radius."""
        h = hash((args.seed, "jitter", lemma)) & 0xFFFFFFFF
        rr = random.Random(h)
        dx = rr.gauss(0, sigma)
        dy = rr.gauss(0, sigma)
        dz = rr.gauss(0, sigma)
        r = math.sqrt(dx * dx + dy * dy + dz * dz)
        if r > radius:
            k = radius / (r + 1e-9)
            dx *= k
            dy *= k
            dz *= k
        return {"x": center["x"] + dx, "y": center["y"] + dy, "z": center["z"] + dz}

    # precompute per-galaxy local layouts (optional)
    local_offsets: Dict[str, Dict[str, Dict[str, float]]] = {}  # gid -> lemma -> {x,y,z} (centered, scaled)
    if args.intra_layout in ("drl", "fr"):
        for gid, members in galaxy_members.items():
            if gid == "void" or len(members) < 2:
                continue

            # too big => fallback jitter
            if len(members) > args.max_intra_layout:
                continue

            e = edges_by_galaxy.get(gid, [])
            if len(e) < 3:
                continue

            g_local = to_igraph_subgraph(members, e)
            if g_local.ecount() == 0 or g_local.vcount() < 2:
                continue

            seed_local = args.seed + (hash(gid) & 0xFFFF)
            if args.intra_layout == "drl":
                coords = layout_drl_3d(g_local, seed=seed_local)
            else:
                coords = layout_fr_3d(g_local, seed=seed_local, niter=args.local_fr_iter)

            tmp = coords_to_pos(g_local.vs["id"], coords)
            tmp = normalize_positions(tmp, target_radius=galaxy_local_radius.get(gid, global_local_radius))
            local_offsets[gid] = tmp

        print(f"[LOCAL] computed local layouts for {len(local_offsets)} galaxies (mode={args.intra_layout})")

    # --- Place WordNet stars first (membership nodes)
    # Use lemmas from membership union (ensures we place all WordNet nodes even if lemma-graph contains more)
    # But also place any WordNet node in lemma-graph that has membership.
    wordnet_lemmas = [l for l in lemmas_all if is_wordnet(l)]
    for lemma in wordnet_lemmas:
        gid = lemma_to_galaxy.get(lemma, "void")

        if gid == "void" or gid not in pos_gal:
            x, y, z = sample_sphere(rng, args.void_shell * (0.9 + 0.2 * rng.random()))
            stars[lemma] = {"x": x, "y": y, "z": z}
            continue

        center = pos_gal[gid]
        rloc = galaxy_local_radius.get(gid, global_local_radius)

        if gid in local_offsets and lemma in local_offsets[gid]:
            off = local_offsets[gid][lemma]
            stars[lemma] = {"x": center["x"] + off["x"], "y": center["y"] + off["y"], "z": center["z"] + off["z"]}
        else:
            stars[lemma] = place_jitter(lemma, center, radius=rloc, sigma=args.jitter_sigma)

    # --- Place externals as satellites near WordNet anchors (ETYMOLOGY)
    etym_adj = defaultdict(list)
    for u, v in etym_edges:
        etym_adj[u].append(v)
        etym_adj[v].append(u)

    externals = [l for l in lemmas_all if is_external(l)]

    def place_satellite(external_id: str) -> Dict[str, float]:
        # candidates = WordNet neighbors already placed
        candidates = [x for x in etym_adj.get(external_id, []) if (x in stars and is_wordnet(x))]
        if not candidates:
            x, y, z = sample_sphere(rng, args.void_shell * (0.9 + 0.2 * rng.random()))
            return {"x": x, "y": y, "z": z}

        anchor = candidates[0]  # deterministic
        ax, ay, az = stars[anchor]["x"], stars[anchor]["y"], stars[anchor]["z"]

        gid = lemma_to_galaxy.get(anchor, "void")
        rloc = galaxy_local_radius.get(gid, global_local_radius)
        sat_r = max(1.5, 0.25 * rloc)

        h = hash((args.seed, "sat", external_id, anchor)) & 0xFFFFFFFF
        rr = random.Random(h)
        # épaisseur + rayon variable (évite les "boules" trop nettes)
        r = sat_r * (0.35 + 1.15 * rr.random())  # entre ~0.35x et ~1.5x
        dx, dy, dz = sample_sphere(rr, r)

        # léger cisaillement anisotrope (optionnel mais très efficace)
        dx *= 1.6
        dy *= 1.0
        dz *= 0.7

        return {"x": ax + dx, "y": ay + dy, "z": az + dz}


    for ext in externals:
        if ext in stars:
            continue
        if args.satellite_external:
            stars[ext] = place_satellite(ext)
        else:
            x, y, z = sample_sphere(rng, args.void_shell * (0.9 + 0.2 * rng.random()))
            stars[ext] = {"x": x, "y": y, "z": z}

    # --- Ensure every galaxy has at least one visible center pos (already), and write outputs
    with open(args.out_galaxies_pos, "w", encoding="utf-8") as f:
        json.dump(pos_gal, f, ensure_ascii=False, indent=2)

    with open(args.out_stars_pos, "w", encoding="utf-8") as f:
        json.dump(stars, f, ensure_ascii=False, indent=2)

    print("✅ compute_positions_cosmic terminé")
    print(f"→ galaxies pos: {args.out_galaxies_pos}")
    print(f"→ stars pos:    {args.out_stars_pos}")
    print(f"[INFO] stars placed: {len(stars)} (wordnet={len(wordnet_lemmas)}, externals={len(externals)})")


if __name__ == "__main__":
    main()
