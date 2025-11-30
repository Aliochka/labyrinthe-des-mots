// src/utils/graphUtils.ts
import type { GraphSlice } from '../types/graph';
import type { ExpandFromWordResult, FindPathBetweenWordsResult } from '../types/api';

export interface CombinedGraphResult {
  combinedGraph: GraphSlice | null;
  highlightNodeIds: number[];
}

/**
 * Construit un graphe combiné et les nœuds à surligner à partir de :
 * - expandFirst.graph : le graphe d'exploration du premier mot
 * - pathResult : le résultat de findPathBetweenWords
 */
export function buildCombinedGraph(
  expandFirst: ExpandFromWordResult | null,
  pathResult: FindPathBetweenWordsResult | null
): CombinedGraphResult {
  // Si pas d'exploration du premier mot, on ne peut rien afficher
  if (!expandFirst?.graph) {
    return {
      combinedGraph: null,
      highlightNodeIds: [],
    };
  }

  // Si pas de chemin trouvé, on affiche juste le graphe d'exploration
  if (
    !pathResult?.pathResult?.paths?.[0] ||
    pathResult.pathResult.status !== 'OK'
  ) {
    return {
      combinedGraph: expandFirst.graph,
      highlightNodeIds: [],
    };
  }

  const firstPath = pathResult.pathResult.paths[0];
  const pathNodeIds = firstPath.nodes.map((node) => node.id);

  // Fusion des nœuds sans doublons (basé sur id)
  const nodeMap = new Map<number, GraphSlice['nodes'][number]>();

  // D'abord, on ajoute tous les nœuds du graphe d'exploration
  for (const node of expandFirst.graph.nodes) {
    nodeMap.set(node.id, node);
  }

  // Ensuite, on ajoute les nœuds du chemin (remplace si déjà présent)
  for (const node of firstPath.nodes) {
    nodeMap.set(node.id, node);
  }

  // Fusion des arêtes sans doublons
  const edgeKeySet = new Set<string>();
  const edges: GraphSlice['edges'] = [];

  // D'abord, on ajoute toutes les arêtes du graphe d'exploration
  for (const edge of expandFirst.graph.edges) {
    const key = `${edge.from}-${edge.to}-${edge.type}`;
    if (!edgeKeySet.has(key)) {
      edgeKeySet.add(key);
      edges.push(edge);
    }
  }

  // Ensuite, on ajoute les arêtes du chemin
  for (const edge of firstPath.edges) {
    const key = `${edge.from}-${edge.to}-${edge.type}`;
    if (!edgeKeySet.has(key)) {
      edgeKeySet.add(key);
      edges.push(edge);
    }
  }

  const combinedGraph: GraphSlice = {
    nodes: Array.from(nodeMap.values()),
    edges,
    centerId: expandFirst.graph.centerId,
    depthExplored: expandFirst.graph.depthExplored,
  };

  return {
    combinedGraph,
    highlightNodeIds: pathNodeIds,
  };
}