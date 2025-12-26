/**
 * Coordinate normalization utilities for Map2D
 */

import type { GraphNode } from "../../../../types/graph";
import { NORMALIZE_PADDING } from "../constants";

/**
 * Normalizes node coordinates to fit within canvas dimensions
 * Centers the graph and scales to fill ~90% of the available space
 *
 * @param nodes - Array of graph nodes with x, y coordinates
 * @param width - Canvas width in pixels
 * @param height - Canvas height in pixels
 * @returns New array of nodes with normalized coordinates
 */
export function normalizeNodesForCanvas(
  nodes: GraphNode[],
  width: number,
  height: number
): GraphNode[] {
  if (!nodes.length) return [];

  // Find bounding box
  let minX = Infinity,
    maxX = -Infinity,
    minY = Infinity,
    maxY = -Infinity;

  for (const n of nodes) {
    const x = n.x ?? 0;
    const y = n.y ?? 0;
    if (x < minX) minX = x;
    if (x > maxX) maxX = x;
    if (y < minY) minY = y;
    if (y > maxY) maxY = y;
  }

  const spanX = maxX - minX || 1;
  const spanY = maxY - minY || 1;

  // Calculate center
  const cx = (minX + maxX) / 2;
  const cy = (minY + maxY) / 2;

  // Fill ~90% of canvas area
  const scale =
    NORMALIZE_PADDING *
    Math.min(width / spanX, height / spanY);

  // Clone and apply normalization
  return nodes.map((n) => {
    const x = (n.x ?? 0) - cx;
    const y = (n.y ?? 0) - cy;
    return {
      ...n,
      x: x * scale,
      y: y * scale,
    };
  });
}
