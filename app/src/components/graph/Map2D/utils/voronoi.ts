/**
 * Voronoi diagram computation utilities for Map2D
 */

import { Delaunay } from "d3-delaunay";
import type { GraphNode } from "../../../../types/graph";

/**
 * Voronoi computation result
 */
export interface VoronoiResult {
  /** Voronoi diagram */
  voronoi: any;  // d3-delaunay Voronoi type
  /** Delaunay triangulation */
  delaunay: Delaunay<Float64Array>;
  /** Bounding box [minX, minY, maxX, maxY] */
  bbox: [number, number, number, number];
}

/**
 * Computes Voronoi diagram from normalized node positions
 * Uses d3-delaunay for efficient Voronoi cell computation
 *
 * @param nodes - Array of nodes with x, y coordinates
 * @param width - Canvas width (for bbox safety margins)
 * @param height - Canvas height (for bbox safety margins)
 * @returns Voronoi diagram with Delaunay triangulation, or null if no nodes
 */
export function computeVoronoi(
  nodes: GraphNode[],
  width: number,
  height: number
): VoronoiResult | null {
  if (!nodes.length) return null;

  // Build points array for Delaunay
  const points = new Float64Array(nodes.length * 2);

  let minX = Infinity,
    maxX = -Infinity,
    minY = Infinity,
    maxY = -Infinity;

  nodes.forEach((n, i) => {
    const x = n.x ?? 0;
    const y = n.y ?? 0;

    points[i * 2] = x;
    points[i * 2 + 1] = y;

    if (x < minX) minX = x;
    if (x > maxX) maxX = x;
    if (y < minY) minY = y;
    if (y > maxY) maxY = y;
  });

  // Safety: if all points have same coordinate, add margin
  if (minX === maxX) {
    minX -= width / 4;
    maxX += width / 4;
  }
  if (minY === maxY) {
    minY -= height / 4;
    maxY += height / 4;
  }

  // Add padding around point cloud (5% of min dimension)
  const padding = Math.min(width, height) * 0.05;

  const bbox: [number, number, number, number] = [
    minX - padding,
    minY - padding,
    maxX + padding,
    maxY + padding,
  ];

  // Compute Delaunay triangulation and Voronoi diagram
  const delaunay = new Delaunay(points);
  const voronoi = delaunay.voronoi(bbox);

  return { voronoi, delaunay, bbox };
}
