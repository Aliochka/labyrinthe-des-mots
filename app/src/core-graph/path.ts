// src/core-graph/path.ts
import type { PathResult, RelationEdge } from '../types/graph';
import type { PathOptions } from '../types/api';
import { getNeighbors, getSynsetById } from './graphStore';

/**
 * Trouve un chemin le plus court entre deux synsets avec un BFS.
 */
export function findPathBetweenSynsets(
  startId: number,
  endId: number,
  options: PathOptions = {}
): PathResult {
  const allowedTypes = options.allowedRelationTypes; // undefined = tout
  const maxDepth = options.maxDepth ?? 10;
  const maxPaths = options.maxPaths ?? 1;

  // Vérif de base
  const startNode = getSynsetById(startId);
  const endNode = getSynsetById(endId);
  if (!startNode || !endNode) {
    return {
      status: 'START_OR_END_NOT_FOUND',
      paths: [],
      meta: { exploredNodes: 0, truncated: false },
    };
  }

  if (startId === endId) {
    // Trivial: chemin de longueur 0
    return {
      status: 'OK',
      paths: [
        {
          nodes: [startNode],
          edges: [],
        },
      ],
      meta: { exploredNodes: 1, truncated: false },
    };
  }

  type QueueItem = { id: number; depth: number };
  const queue: QueueItem[] = [{ id: startId, depth: 0 }];
  const visited = new Set<number>([startId]);
  const parent = new Map<number, { prev: number; viaEdge: RelationEdge }>();

  let found = false;
  let exploredNodes = 0;

  while (queue.length > 0) {
    const { id, depth } = queue.shift()!;
    exploredNodes++;

    if (depth >= maxDepth) continue;

    const neighbors = getNeighbors(id);

    for (const edge of neighbors) {
      if (allowedTypes && !allowedTypes.includes(edge.type)) {
        continue;
      }

      const nextId = edge.to;
      if (!visited.has(nextId)) {
        visited.add(nextId);
        parent.set(nextId, { prev: id, viaEdge: edge });

        if (nextId === endId) {
          found = true;
          queue.length = 0; // on vide la queue pour sortir
          break;
        }

        queue.push({ id: nextId, depth: depth + 1 });
      }
    }
  }

  if (!found) {
    return {
      status: 'NO_PATH',
      paths: [],
      meta: { exploredNodes, truncated: false },
    };
  }

  // Reconstruction du chemin end -> start via parent
  const nodeIds: number[] = [];
  const edges: RelationEdge[] = [];

  let currentId = endId;
  while (currentId !== startId) {
    nodeIds.push(currentId);
    const info = parent.get(currentId);
    if (!info) break; // sécurité
    edges.push(info.viaEdge);
    currentId = info.prev;
  }
  nodeIds.push(startId);

  nodeIds.reverse();
  edges.reverse();

  const nodes = nodeIds
    .map((id) => getSynsetById(id))
    .filter((n): n is NonNullable<typeof n> => Boolean(n));

  return {
    status: 'OK',
    paths: [
      {
        nodes,
        edges,
      },
    ].slice(0, maxPaths),
    meta: { exploredNodes, truncated: false },
  };
}
