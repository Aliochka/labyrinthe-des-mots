// src/core-graph/path.ts
import type { PathResult } from '../types/graph';
import type { PathOptions } from '../types/api';

// Fonction "core" : trouver un chemin entre deux synsets
export function findPathBetweenSynsets(
  startId: number,
  endId: number,
  options: PathOptions = {}
): PathResult {
  // TODO: implémenter la vraie logique de recherche de chemin ici.
  // Pour l'instant, on renvoie un résultat "NO_PATH" par défaut.
  return {
    status: 'NO_PATH',
    paths: [],
    meta: {
      exploredNodes: 0,
      truncated: false,
    },
  };
}
