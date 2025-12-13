#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""
compute_clusters.py

Usage:
  python scripts/compute_clusters.py \
      app/public/lemma-graph.json \
      data/clusters.json \
      [max_nodes]

- input_graph : graphe lexical brut (nodes + links/edges)
- output_clusters : fichier JSON avec les clusters par niveau
- max_nodes (optionnel) : nombre max de nœuds à clusteriser
    (par défaut : None = tous les nœuds)
"""

import json
import sys
from collections import defaultdict
from typing import Dict, List, Tuple, Optional

import igraph as ig
import leidenalg as la

# ===============================
# Paramètres de niveaux
# ===============================

LEVELS = [
    ("supercluster", 0.0001),  # ~300-500 clusters - thèmes majeurs (ajusté: 0.006 × 300/20059)
    ("cluster", 0.01),         # ~3000-5000 clusters - domaines sémantiques (ajusté: 0.07 × 3500/24327)
    ("galaxy", 0.14),          # ~15000-20000 clusters - sous-thèmes (ajusté: 0.30 × 15000/32454)
]

# Valeur par défaut si max_nodes n'est pas fourni
DEFAULT_MAX_NODES: Optional[int] = None  # None = tous les nœuds


# ===============================
# Helpers
# ===============================


def load_graph(path: str) -> Dict:
    with open(path, "r", encoding="utf-8") as f:
        return json.load(f)


def canonical_id(node: Dict) -> str:
    """
    Choisit un ID canonique pour un nœud.
    Priorité : lemma > label > name > id
    """
    if "lemma" in node and node["lemma"] is not None:
        return str(node["lemma"])
    if "label" in node and node["label"] is not None:
        return str(node["label"])
    if "name" in node and node["name"] is not None:
        return str(node["name"])
    return str(node.get("id"))


def canonical_from_raw_id(raw_id, id_map: Dict[str, str]) -> Optional[str]:
    """
    Convertit un id brut de lien (source/target) en id canonique,
    en utilisant l'id_map construite à partir des nœuds.
    """
    s = str(raw_id)
    return id_map.get(s)


def compute_degrees(
    nodes: List[Dict], links: List[Dict], id_map: Dict[str, str]
) -> Dict[str, int]:
    """
    Degré simple (non pondéré) par ID canonique.
    """
    degree = {canonical_id(n): 0 for n in nodes}

    for link in links:
        s = canonical_from_raw_id(link["source"], id_map)
        t = canonical_from_raw_id(link["target"], id_map)
        if s is None or t is None:
            continue
        if s == t:
            continue
        degree[s] = degree.get(s, 0) + 1
        degree[t] = degree.get(t, 0) + 1

    return degree


def select_top_nodes_by_degree(
    degree: Dict[str, int], max_nodes: Optional[int]
) -> List[str]:
    """
    Retourne la liste des IDs triés par degré décroissant,
    éventuellement tronquée à max_nodes.
    """
    items = sorted(degree.items(), key=lambda kv: kv[1], reverse=True)
    if max_nodes is not None and len(items) > max_nodes:
        items = items[:max_nodes]
    return [nid for (nid, _) in items]


def build_igraph(
    selected_ids: List[str], links: List[Dict], id_map: Dict[str, str]
) -> ig.Graph:
    """
    Construit un igraph non orienté à partir des IDs sélectionnés.
    Les sommets sont indexés 0..N-1, avec un attribut "name" = canonical_id.
    Les arêtes ne sont ajoutées que si les deux extrémités sont dans selected_ids.
    """
    selected_set = set(selected_ids)
    index_of = {nid: i for i, nid in enumerate(selected_ids)}

    g = ig.Graph(n=len(selected_ids), directed=False)
    g.vs["name"] = selected_ids

    edges: List[Tuple[int, int]] = []

    for link in links:
        s = canonical_from_raw_id(link["source"], id_map)
        t = canonical_from_raw_id(link["target"], id_map)
        if s is None or t is None:
            continue
        if s == t:
            continue
        if s not in selected_set or t not in selected_set:
            continue

        i = index_of[s]
        j = index_of[t]
        if i == j:
            continue

        edges.append((i, j))

    if edges:
        g.add_edges(edges)
        # On peut simplifier (supprimer doublons & boucles au cas où)
        g.simplify(multiple=True, loops=True, combine_edges=None)

    return g


def run_leiden_levels(g: ig.Graph) -> Dict[str, Dict[str, str]]:
    """
    Lance Leiden pour chaque niveau configuré (LEVELS),
    retourne un dict :
        { level_name: { nodeName: clusterId } }
    où nodeName = g.vs["name"][i]
    """
    levels_result: Dict[str, Dict[str, str]] = {}

    if g.ecount() == 0:
        # Pas d'arêtes -> chaque nœud est seul dans son cluster, pour tous les niveaux
        names = g.vs["name"]
        for level_name, _res in LEVELS:
            mapping = {name: f"{level_name}_solo_{i}" for i, name in enumerate(names)}
            levels_result[level_name] = mapping
        return levels_result

    for level_name, res in LEVELS:
        print(f"➡ Leiden niveau {level_name} (resolution={res})")
        part = la.find_partition(g, la.CPMVertexPartition, resolution_parameter=res)
        membership = part.membership  # liste d'indices de communautés
        names = g.vs["name"]

        mapping: Dict[str, str] = {}
        for idx, comm_id in enumerate(membership):
            node_name = names[idx]
            mapping[node_name] = f"{level_name}_{comm_id}"

        levels_result[level_name] = mapping

    return levels_result


# ===============================
# Layout de clusters (FR / FA2-like)
# ===============================


def compute_cluster_layout(
    level_name: str,
    cluster_map: Dict[str, str],
    raw_links: List[Dict],
    id_map: Dict[str, str],
) -> Dict[str, Dict]:
    """
    Construit un graphe entre clusters et calcule un layout 2D (Fruchterman-Reingold).

    Retour :
        {
          cluster_id: {
            "x": ...,
            "y": ...,
            "size": nb_de_membres,
            "members": [node_ids...]
          }
        }
    """

    # 1) Regrouper les nœuds par cluster
    buckets: Dict[str, List[str]] = defaultdict(list)
    for node_id, cid in cluster_map.items():
        buckets[cid].append(node_id)

    cluster_ids = list(buckets.keys())
    if not cluster_ids:
        return {}

    index_of = {cid: i for i, cid in enumerate(cluster_ids)}

    # 2) Construire un graphe igraph entre clusters
    g = ig.Graph(n=len(cluster_ids), directed=False)
    g.vs["name"] = cluster_ids

    edge_weights: Dict[Tuple[str, str], int] = defaultdict(int)

    for link in raw_links:
        s = canonical_from_raw_id(link["source"], id_map)
        t = canonical_from_raw_id(link["target"], id_map)
        if not s or not t:
            continue
        if s == t:
            continue

        c1 = cluster_map.get(s)
        c2 = cluster_map.get(t)
        if not c1 or not c2 or c1 == c2:
            continue

        edge = tuple(sorted((c1, c2)))
        edge_weights[edge] += 1

    edges: List[Tuple[int, int]] = []
    weights: List[float] = []
    for (c1, c2), w in edge_weights.items():
        i = index_of[c1]
        j = index_of[c2]
        edges.append((i, j))
        weights.append(float(w))

    if edges:
        g.add_edges(edges)
        g.es["weight"] = weights

    # 3) Layout (Fruchterman-Reingold)
    if g.ecount() > 0:
        print(
            f"🌀 Layout FR pour {level_name} (clusters={len(cluster_ids)}, edges={g.ecount()})"
        )
        layout = g.layout_fruchterman_reingold(weights=g.es["weight"], niter=200)
    else:
        # Aucun lien entre clusters → cercle
        print(f"🌀 Layout circle pour {level_name} (clusters sans liens)")
        layout = g.layout_circle()

    coords = layout.coords
    xs = [c[0] for c in coords]
    ys = [c[1] for c in coords]

    # 4) Normalisation dans un carré ~ [-1000, 1000]
    min_x, max_x = min(xs), max(xs)
    min_y, max_y = min(ys), max(ys)

    def norm(v: float, vmin: float, vmax: float) -> float:
        if vmax - vmin < 1e-9:
            return 0.0
        return (v - vmin) / (vmax - vmin) * 2000.0 - 1000.0

    out: Dict[str, Dict] = {}
    for cid, idx in index_of.items():
        x_raw, y_raw = coords[idx]
        out[cid] = {
            "x": norm(x_raw, min_x, max_x),
            "y": norm(y_raw, min_y, max_y),
            "size": len(buckets[cid]),
            "members": buckets[cid],
        }

    return out


# ===============================
# MAIN
# ===============================


def main():
    if len(sys.argv) < 3:
        print(
            "Usage: python scripts/compute_clusters.py <input_graph.json> <output_clusters.json> [max_nodes]"
        )
        sys.exit(1)

    input_path = sys.argv[1]
    output_path = sys.argv[2]
    max_nodes_arg = sys.argv[3] if len(sys.argv) >= 4 else None

    max_nodes: Optional[int]
    if max_nodes_arg is None:
        max_nodes = DEFAULT_MAX_NODES
    else:
        try:
            max_nodes = int(max_nodes_arg)
        except ValueError:
            print(
                f"⚠️  max_nodes invalide: {max_nodes_arg}, on ignore (tous les nœuds)."
            )
            max_nodes = DEFAULT_MAX_NODES

    print(f"📥 Lecture du graphe : {input_path}")
    data = load_graph(input_path)

    raw_nodes = data.get("nodes", [])
    raw_links = data.get("links") or data.get("edges") or []

    print(f"  Nœuds : {len(raw_nodes)}")
    print(f"  Liens : {len(raw_links)}")

    # Mapping brut -> canonique
    id_map: Dict[str, str] = {}
    for n in raw_nodes:
        original = str(n.get("id") or n.get("lemma") or n.get("label") or n.get("name"))
        cid = canonical_id(n)
        id_map[original] = cid

    # Degrés
    print("📏 Calcul des degrés...")
    degree = compute_degrees(raw_nodes, raw_links, id_map)

    # Sélection des nœuds à clusteriser
    if max_nodes is not None:
        print(f"🎯 Sélection des top {max_nodes} nœuds par degré...")
    else:
        print("🎯 Sélection de tous les nœuds pour Leiden...")

    selected_ids = select_top_nodes_by_degree(degree, max_nodes)
    print(f"  Nœuds sélectionnés pour Leiden : {len(selected_ids)}")

    # Construction du graphe igraph
    print("🧱 Construction du graphe igraph...")
    g = build_igraph(selected_ids, raw_links, id_map)
    print(f"  Sommets: {g.vcount()}, Arêtes: {g.ecount()}")

    # Leiden multi-niveaux
    print("🧠 Lancement de Leiden sur plusieurs niveaux...")
    levels_mapping = run_leiden_levels(g)

    # Layout de clusters pour chaque niveau
    print("🧭 Calcul des layouts de clusters...")
    cluster_positions: Dict[str, Dict[str, Dict]] = {}
    for level_name in levels_mapping.keys():
        print(f"  → Layout pour niveau '{level_name}'")
        cluster_positions[level_name] = compute_cluster_layout(
            level_name,
            levels_mapping[level_name],
            raw_links,
            id_map,
        )

    # Construction de la sortie
    output = {
        "meta": {
            "input_nodes": len(raw_nodes),
            "input_links": len(raw_links),
            "clustered_nodes": len(selected_ids),
            "levels": [name for (name, _res) in LEVELS],
            "max_nodes": max_nodes,
        },
        "levels": levels_mapping,  # mapping node -> cluster_id
        "positions": cluster_positions,  # positions & membres de chaque cluster
    }

    print(f"💾 Écriture des clusters : {output_path}")
    with open(output_path, "w", encoding="utf-8") as f:
        json.dump(output, f, ensure_ascii=False, indent=2)

    print("✅ Terminé.")


if __name__ == "__main__":
    main()
