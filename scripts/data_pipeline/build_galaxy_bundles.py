#!/usr/bin/env python3
import json, argparse, math
from collections import defaultdict

def load_positions(path):
    # format: { "gc_0": {"x":..,"y":..,"z":..}, ... }
    data = json.load(open(path, "r", encoding="utf-8"))
    pos = {}
    for gid, p in data.items():
        pos[gid] = (float(p["x"]), float(p["y"]), float(p["z"]))
    return pos

def load_edges(path):
    gg = json.load(open(path, "r", encoding="utf-8"))
    edges = gg.get("edges", gg.get("links", []))
    out = []
    for e in edges:
        a = e["source"]
        b = e["target"]
        w = float(e.get("weight", 1))
        out.append((a, b, w))
    return out

def vec_add(a,b): return (a[0]+b[0], a[1]+b[1], a[2]+b[2])
def vec_sub(a,b): return (a[0]-b[0], a[1]-b[1], a[2]-b[2])
def vec_mul(a,s): return (a[0]*s, a[1]*s, a[2]*s)
def vec_len(a): return math.sqrt(a[0]*a[0]+a[1]*a[1]+a[2]*a[2])
def vec_norm(a):
    l = vec_len(a)
    return (0.0,0.0,0.0) if l == 0 else (a[0]/l, a[1]/l, a[2]/l)

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--galaxy-graph", required=True)
    ap.add_argument("--galaxies-pos", required=True)
    ap.add_argument("--min-weight", type=float, default=2)
    ap.add_argument("--topk-per-galaxy", type=int, default=25)
    ap.add_argument("--hub-mode", choices=["center", "mid_offset"], default="mid_offset")
    ap.add_argument("--offset", type=float, default=30.0, help="amplitude offset pour mid_offset")
    ap.add_argument("--samples", type=int, default=24, help="nb de points échantillonnés pour la courbe")
    ap.add_argument("--out", required=True)
    args = ap.parse_args()

    pos = load_positions(args.galaxies_pos)
    edges = load_edges(args.galaxy_graph)

    # 1) filtre minWeight + positions existantes
    filtered = []
    for a,b,w in edges:
        if w < args.min_weight:
            continue
        if a not in pos or b not in pos:
            continue
        filtered.append((a,b,w))

    # 2) topK par galaxie (garde les plus lourds par endpoint)
    by_g = defaultdict(list)
    for a,b,w in filtered:
        by_g[a].append((a,b,w))
        by_g[b].append((a,b,w))

    keep = set()
    for g, lst in by_g.items():
        lst.sort(key=lambda t: t[2], reverse=True)
        for a,b,w in lst[:args.topk_per_galaxy]:
            k = (a,b) if a < b else (b,a)
            keep.add(k)

    # 3) routes
    routes = []
    for a,b,w in filtered:
        k = (a,b) if a < b else (b,a)
        if k not in keep:
            continue

        A = pos[a]
        B = pos[b]

        if args.hub_mode == "center":
            H = (0.0, 0.0, 0.0)
        else:
            # hub = midpoint + offset perpendiculaire (évite que tout traverse le même point)
            mid = vec_mul(vec_add(A,B), 0.5)

            # direction AB et un "up" fixe → perpendiculaire stable
            d = vec_norm(vec_sub(B, A))
            up = (0.0, 1.0, 0.0)
            # cross(d, up)
            perp = (d[1]*up[2]-d[2]*up[1], d[2]*up[0]-d[0]*up[2], d[0]*up[1]-d[1]*up[0])
            perp = vec_norm(perp)

            # si d ~ up => perp ~ 0, fallback sur un autre up
            if vec_len(perp) < 1e-6:
                up2 = (1.0, 0.0, 0.0)
                perp = (d[1]*up2[2]-d[2]*up2[1], d[2]*up2[0]-d[0]*up2[2], d[0]*up2[1]-d[1]*up2[0])
                perp = vec_norm(perp)

            H = vec_add(mid, vec_mul(perp, args.offset))

        routes.append({
            "a": a,
            "b": b,
            "weight": w,
            # 3 points de contrôle → CatmullRom côté front
            "points": [
                [A[0],A[1],A[2]],
                [H[0],H[1],H[2]],
                [B[0],B[1],B[2]],
            ]
        })

    out = {
        "routes": routes,
        "meta": {
            "minWeight": args.min_weight,
            "topKPerGalaxy": args.topk_per_galaxy,
            "hubMode": args.hub_mode,
            "offset": args.offset,
            "routeCount": len(routes)
        }
    }

    with open(args.out, "w", encoding="utf-8") as f:
        json.dump(out, f)

    print(f"✅ wrote {args.out} routes={len(routes)}")

if __name__ == "__main__":
    main()
