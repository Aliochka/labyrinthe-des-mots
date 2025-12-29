import { useMemo, useRef } from 'react';
import { Vector3 } from 'three';
import type { WordNode } from '../types/game';
import { lemmaDataService } from '../services/LemmaDataService';

/**
 * Navigation edge with full WordNode objects for rendering
 */
export interface NavigationEdge {
  source: WordNode;
  target: WordNode;
  relationTypes: string[];
  weight: number;
}

/**
 * Hook to compute edges between nearby words within render distance
 *
 * Performance optimizations:
 * - Only computes edges for nodes within maxDistance from player
 * - Deduplicates bidirectional edges
 * - Throttles recomputation (only when player moves >5 units)
 * - Uses Map for O(1) node lookups
 *
 * @param nodes - All word nodes from useLemmaGraph
 * @param playerPosition - Current player position
 * @param maxDistance - Maximum distance to compute edges (default: 50)
 * @returns Array of edges between nearby nodes
 */
export function useNavigationLinks(
  nodes: WordNode[],
  playerPosition: Vector3,
  maxDistance: number = 50
): NavigationEdge[] {
  // Throttling: store last computed position
  const lastComputePos = useRef(new Vector3());

  // Check if player moved enough to trigger recomputation
  const positionKey = useMemo(() => {
    const moved = playerPosition.distanceTo(lastComputePos.current);
    if (moved > 5) {
      lastComputePos.current.copy(playerPosition);
      return `${Math.floor(playerPosition.x / 5)},${Math.floor(playerPosition.y / 5)},${Math.floor(playerPosition.z / 5)}`;
    }
    return `${Math.floor(lastComputePos.current.x / 5)},${Math.floor(lastComputePos.current.y / 5)},${Math.floor(lastComputePos.current.z / 5)}`;
  }, [playerPosition]);

  // Compute map of nearby nodes (within maxDistance)
  const nearbyNodesMap = useMemo(() => {
    const map = new Map<string, WordNode>();
    nodes.forEach(node => {
      const dist = playerPosition.distanceTo(node.position);
      if (dist <= maxDistance) {
        map.set(node.id, node);
      }
    });
    console.log(`[useNavigationLinks] Found ${map.size} nearby nodes within ${maxDistance} units`);
    return map;
  }, [nodes, playerPosition, maxDistance]);

  // Compute edges between nearby nodes
  const edges = useMemo(() => {
    if (nearbyNodesMap.size === 0) {
      return [];
    }

    const edgeMap = new Map<string, NavigationEdge>();

    // For each nearby node, get its edges
    for (const [nodeId, node] of nearbyNodesMap) {
      try {
        const lemmaEdges = lemmaDataService.getLemmaEdges(nodeId);

        for (const edge of lemmaEdges) {
          // Only include edge if target is also nearby
          const targetNode = nearbyNodesMap.get(edge.target);
          if (!targetNode) continue;

          // Deduplicate bidirectional edges using sorted key
          const key = [edge.source, edge.target].sort().join('||');
          if (edgeMap.has(key)) continue;

          // Add edge with full WordNode objects
          edgeMap.set(key, {
            source: node,
            target: targetNode,
            relationTypes: edge.relationTypes,
            weight: edge.weight,
          });
        }
      } catch (error) {
        // LemmaDataService might not be initialized yet
        console.warn(`[useNavigationLinks] Could not get edges for ${nodeId}:`, error);
      }
    }

    const edgeCount = edgeMap.size;
    console.log(`[useNavigationLinks] Computed ${edgeCount} edges between ${nearbyNodesMap.size} nearby nodes`);

    return Array.from(edgeMap.values());
  }, [nearbyNodesMap, positionKey]); // positionKey ensures throttling

  return edges;
}
