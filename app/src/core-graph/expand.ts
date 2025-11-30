// src/core-graph/expand.ts
import type { GraphSlice } from '../types/graph';
import type { ExpandOptions } from '../types/api';
import { getAllNodesByIds, getNeighbors, getSynsetById } from './graphStore';

/**
 * Expansion à partir d'un synsetId avec une petite BFS.
 */
export function expandFromSynset(
  centerId: number,
  options: ExpandOptions = {}
): GraphSlice {
  const depth = options.depth ?? 1;
  const maxNodes = options.maxNodes ?? 100;
  const allowedTypes = options.allowedRelationTypes; // peut être undefined = tout type

  // Si le centre n'existe pas -> graphe vide
  const centerNode = getSynsetById(centerId);
  if (!centerNode) {
    return {
      nodes: [],
      edges: [],
      centerId,
      depthExplored: 0,
    };
  }

  // BFS simple
  const visited = new Set<number>();
  const edgesAccum: { from: number; to: number; type: any }[] = [];

  type QueueItem = { id: number; depth: number };
  const queue: QueueItem[] = [{ id: centerId, depth: 0 }];
  visited.add(centerId);

  let depthReached = 0;

  while (queue.length > 0) {
    const { id, depth: currentDepth } = queue.shift()!;
    depthReached = Math.max(depthReached, currentDepth);

    if (currentDepth >= depth) continue;

    const neighbors = getNeighbors(id);

    for (const edge of neighbors) {
      // Filtre sur le type de relation si nécessaire
      if (allowedTypes && !allowedTypes.includes(edge.type)) {
        continue;
      }

      edgesAccum.push(edge);

      if (!visited.has(edge.to)) {
        visited.add(edge.to);

        if (visited.size >= maxNodes) {
          break;
        }

        queue.push({ id: edge.to, depth: currentDepth + 1 });
      }
    }

    if (visited.size >= maxNodes) {
      break;
    }
  }

  const nodes = getAllNodesByIds(visited);

  return {
    nodes,
    edges: edgesAccum,
    centerId,
    depthExplored: depthReached,
  };
}
