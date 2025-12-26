#!/usr/bin/env python3
"""
Construit le star backbone pour visualisation lisible en mode star.

Algorithme :
1. Pour chaque galaxie, sélectionner M étoiles représentatives (adaptatif)
   - 50% top-degree (hubs sémantiques)
   - 50% centrales spatiales (proches du centre géométrique)
   - Garde-fou : distance minimale entre étoiles (éviter clustering)
   - Toujours inclure l'étoile sélectionnée si présente
2. Construire graphe kNN spatial (k=10-12) sur ces étoiles
3. Calculer MST (Prim/Kruskal) sur ce graphe
4. Hybride : MST + arêtes kNN avec poids élevé
5. Exporter backbone intra-galaxie + inter-galaxie (bundles)
"""

import json
import argparse
from collections import defaultdict
from typing import Dict, List, Set, Tuple
import numpy as np
from scipy.spatial import KDTree
from scipy.sparse import csr_matrix
from scipy.sparse.csgraph import minimum_spanning_tree


def load_json(path: str):
    with open(path, "r", encoding="utf-8") as f:
        return json.load(f)


def load_membership_jsonl(path: str) -> Dict[str, str]:
    """Charge membership lemma → galaxy depuis JSONL."""
    out = {}
    with open(path, "r", encoding="utf-8") as f:
        for line in f:
            if not line.strip():
                continue
            o = json.loads(line)
            out[o["lemma"]] = o["galaxy"]
    return out


def compute_galaxy_center(stars: List[str], positions: Dict) -> np.ndarray:
    """Calcule le centre géométrique d'une galaxie."""
    coords = np.array([[positions[s]["x"], positions[s]["y"], positions[s]["z"]]
                       for s in stars if s in positions])
    return coords.mean(axis=0)


def select_representative_stars(
    galaxy_id: str,
    galaxy_stars: List[str],
    positions: Dict,
    lemma_graph: Dict,
    target_count: int,
    min_distance: float = 15.0
) -> Set[str]:
    """
    Sélectionne M étoiles représentatives pour une galaxie.

    Stratégie :
    - 50% top-degree (hubs sémantiques)
    - 50% centrales spatiales
    - Garde-fou : distance minimale entre étoiles

    Args:
        galaxy_id: ID de la galaxie
        galaxy_stars: Tous les lemmes de la galaxie
        positions: Dict {lemma: {x, y, z}}
        lemma_graph: Graphe complet {nodes, edges}
        target_count: Nombre cible d'étoiles (adaptatif)
        min_distance: Distance minimale entre étoiles sélectionnées
    """
    # Filtrer stars avec positions
    valid_stars = [s for s in galaxy_stars if s in positions]
    if len(valid_stars) <= target_count:
        return set(valid_stars)

    # 1. Calculer degrees depuis lemma_graph
    degree_map = defaultdict(int)
    for edge in lemma_graph["edges"]:
        src, tgt = edge["source"], edge["target"]
        if src in galaxy_stars:
            degree_map[src] += edge.get("weight", 1.0)
        if tgt in galaxy_stars:
            degree_map[tgt] += edge.get("weight", 1.0)

    # 2. Trier par degree
    stars_by_degree = sorted(valid_stars, key=lambda s: degree_map[s], reverse=True)

    # 3. Calculer distances au centre
    center = compute_galaxy_center(valid_stars, positions)
    def dist_to_center(s):
        p = positions[s]
        return np.linalg.norm([p["x"] - center[0], p["y"] - center[1], p["z"] - center[2]])

    stars_by_centrality = sorted(valid_stars, key=dist_to_center)

    # 4. Sélection 50/50 avec garde-fou distance minimale
    selected = set()
    half = target_count // 2

    # Ajouter top-degree (hubs)
    for star in stars_by_degree:
        if len(selected) >= half:
            break
        # Vérifier distance minimale avec déjà sélectionnés
        p = positions[star]
        coords = np.array([p["x"], p["y"], p["z"]])

        too_close = False
        for s in selected:
            ps = positions[s]
            coords_s = np.array([ps["x"], ps["y"], ps["z"]])
            if np.linalg.norm(coords - coords_s) < min_distance:
                too_close = True
                break

        if not too_close:
            selected.add(star)

    # Ajouter centrales
    for star in stars_by_centrality:
        if len(selected) >= target_count:
            break
        if star in selected:
            continue

        p = positions[star]
        coords = np.array([p["x"], p["y"], p["z"]])

        too_close = False
        for s in selected:
            ps = positions[s]
            coords_s = np.array([ps["x"], ps["y"], ps["z"]])
            if np.linalg.norm(coords - coords_s) < min_distance:
                too_close = True
                break

        if not too_close:
            selected.add(star)

    # Compléter si nécessaire (relâcher contrainte distance)
    if len(selected) < target_count:
        for star in stars_by_degree:
            if len(selected) >= target_count:
                break
            if star not in selected:
                selected.add(star)

    return selected


def build_knn_graph(stars: List[str], positions: Dict, k: int = 12) -> List[Tuple[str, str, float]]:
    """Construit un graphe kNN spatial sur les étoiles."""
    # Préparer coordonnées
    coords = np.array([[positions[s]["x"], positions[s]["y"], positions[s]["z"]]
                       for s in stars])

    # KDTree pour kNN
    tree = KDTree(coords)

    edges = []
    for i, star_i in enumerate(stars):
        # k+1 car le point lui-même est inclus
        distances, indices = tree.query(coords[i], k=k+1)

        for dist, j in zip(distances[1:], indices[1:]):  # Skip self
            if i < j:  # Éviter doublons (graphe non-orienté)
                edges.append((star_i, stars[j], dist))

    return edges


def build_mst(stars: List[str], positions: Dict) -> List[Tuple[str, str, float]]:
    """Calcule le Minimum Spanning Tree sur les étoiles."""
    n = len(stars)
    star_idx = {s: i for i, s in enumerate(stars)}

    # Matrice de distances
    coords = np.array([[positions[s]["x"], positions[s]["y"], positions[s]["z"]]
                       for s in stars])

    # Distance matrix complète (dense)
    from scipy.spatial.distance import pdist, squareform
    dist_matrix = squareform(pdist(coords, metric='euclidean'))

    # MST avec scipy
    mst = minimum_spanning_tree(csr_matrix(dist_matrix))
    mst_dense = mst.toarray()

    edges = []
    for i in range(n):
        for j in range(i+1, n):
            weight = mst_dense[i, j]
            if weight > 0:
                edges.append((stars[i], stars[j], weight))

    return edges


def build_star_backbone(
    lemma_graph_path: str,
    membership_path: str,
    positions_path: str,
    target_stars_per_k_members: int = 100,  # 100 stars par 1000 membres
    k_neighbors: int = 12,
    min_distance: float = 15.0,
    out: str = "star_bundles.json"
):
    """
    Construit le star backbone complet.

    Args:
        lemma_graph_path: Chemin vers lemma-graph+etym.json
        membership_path: Chemin vers galaxy_membership.jsonl
        positions_path: Chemin vers positions_stars.json
        target_stars_per_k_members: Ratio adaptatif (ex: 100 stars / 1000 membres)
        k_neighbors: k pour kNN spatial
        min_distance: Distance minimale entre étoiles sélectionnées
        out: Fichier de sortie
    """
    print("[1/6] Chargement des données...")
    lemma_graph = load_json(lemma_graph_path)
    membership = load_membership_jsonl(membership_path)
    positions = load_json(positions_path)

    # Grouper stars par galaxie
    galaxies = defaultdict(list)
    for lemma, gal in membership.items():
        if gal != "void":
            galaxies[gal].append(lemma)

    print(f"[2/6] {len(galaxies)} galaxies trouvées")

    # Pour chaque galaxie, construire backbone local
    all_edges = []
    stats = {}

    for gal_id, gal_stars in galaxies.items():
        # Adapter target count à la taille de la galaxie
        target_count = max(50, int(len(gal_stars) * target_stars_per_k_members / 1000))

        print(f"[{gal_id}] {len(gal_stars)} stars → selecting {target_count} representatives...")

        # Sélectionner étoiles représentatives
        selected = select_representative_stars(
            gal_id, gal_stars, positions, lemma_graph, target_count, min_distance
        )

        if len(selected) < 2:
            continue

        selected_list = list(selected)

        # Construire kNN graph
        knn_edges = build_knn_graph(selected_list, positions, k=k_neighbors)

        # Construire MST
        mst_edges = build_mst(selected_list, positions)

        # Hybride : MST + arêtes kNN fortes
        # Stratégie : garder MST + top 30% des arêtes kNN les plus courtes
        knn_sorted = sorted(knn_edges, key=lambda e: e[2])
        knn_top = knn_sorted[:int(len(knn_sorted) * 0.3)]

        # Combiner (dédupliquer)
        edge_set = set()
        for a, b, w in mst_edges:
            key = tuple(sorted([a, b]))
            edge_set.add(key)

        for a, b, w in knn_top:
            key = tuple(sorted([a, b]))
            edge_set.add(key)

        # Convertir en format final
        for a, b in edge_set:
            pos_a = positions[a]
            pos_b = positions[b]
            dist = np.linalg.norm([pos_a["x"] - pos_b["x"],
                                   pos_a["y"] - pos_b["y"],
                                   pos_a["z"] - pos_b["z"]])

            all_edges.append({
                "a": a,
                "b": b,
                "weight": float(dist),
                "galaxyId": gal_id,
                "points": [[pos_a["x"], pos_a["y"], pos_a["z"]],
                          [pos_b["x"], pos_b["y"], pos_b["z"]]]
            })

        stats[gal_id] = {
            "totalStars": len(gal_stars),
            "selectedStars": len(selected),
            "backboneEdges": len(edge_set)
        }

    print(f"[6/6] Total backbone edges: {len(all_edges)}")

    # Sauvegarder
    output = {
        "backbone": all_edges,
        "meta": {
            "totalEdges": len(all_edges),
            "galaxyCount": len(galaxies),
            "targetStarsPer1k": target_stars_per_k_members,
            "kNeighbors": k_neighbors,
            "minDistance": min_distance,
            "statsByGalaxy": stats
        }
    }

    with open(out, "w", encoding="utf-8") as f:
        json.dump(output, f, ensure_ascii=False, indent=2)

    print(f"✓ Star backbone exporté vers {out}")


def main():
    ap = argparse.ArgumentParser(description="Build star backbone for visualization")
    ap.add_argument("--lemma-graph", required=True, help="Path to lemma-graph+etym.json")
    ap.add_argument("--membership", required=True, help="Path to galaxy_membership.jsonl")
    ap.add_argument("--positions", required=True, help="Path to positions_stars.json")
    ap.add_argument("--stars-per-1k", type=int, default=100, help="Target stars per 1000 members")
    ap.add_argument("--k-neighbors", type=int, default=12, help="k for kNN spatial graph")
    ap.add_argument("--min-distance", type=float, default=15.0, help="Min distance between selected stars")
    ap.add_argument("--out", default="star_bundles.json", help="Output file")
    args = ap.parse_args()

    build_star_backbone(
        lemma_graph_path=args.lemma_graph,
        membership_path=args.membership,
        positions_path=args.positions,
        target_stars_per_k_members=args.stars_per_1k,
        k_neighbors=args.k_neighbors,
        min_distance=args.min_distance,
        out=args.out
    )


if __name__ == "__main__":
    main()
