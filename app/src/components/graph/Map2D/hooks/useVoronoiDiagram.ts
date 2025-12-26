/**
 * Memoized Voronoi diagram computation hook for Map2D
 */

import { useMemo } from "react";
import type { GraphNode } from "../../../../types/graph";
import { computeVoronoi, type VoronoiResult } from "../utils/voronoi";

/**
 * Extended Voronoi result with nodes reference
 */
export interface VoronoiData extends VoronoiResult {
  /** Nodes used for Voronoi computation (for neighbor lookup) */
  nodes: GraphNode[];
}

/**
 * Hook for computing and memoizing Voronoi diagram
 * Recomputes only when nodes, width, or height change
 *
 * @param nodes - Array of nodes with x, y coordinates
 * @param width - Canvas width
 * @param height - Canvas height
 * @returns Voronoi data with diagram, Delaunay, bbox, and nodes reference
 */
export function useVoronoiDiagram(
  nodes: GraphNode[],
  width: number,
  height: number
): VoronoiData | null {
  return useMemo(() => {
    const result = computeVoronoi(nodes, width, height);
    if (!result) return null;

    return {
      ...result,
      nodes,  // Keep reference for drawVoronoiCell neighbor lookup
    };
  }, [nodes, width, height]);
}
