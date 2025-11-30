// src/core-graph/expand.ts
import type { GraphSlice } from '../types/graph';
import type { ExpandOptions } from '../types/api';

// Fonction "core" : expansion à partir d'un synsetId
export function expandFromSynset(
  centerId: number,
  options: ExpandOptions = {}
): GraphSlice {
  // TODO: implémenter la vraie logique d'expansion ici.
  // Pour l'instant, on renvoie un graphe vide avec juste le centerId.
  return {
    nodes: [],
    edges: [],
    centerId,
    depthExplored: options.depth ?? 0,
  };
}
