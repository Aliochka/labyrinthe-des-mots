/**
 * Type definitions for Map2D component
 */

import type { GraphNode } from "../../../types/graph";

/**
 * View modes for Map2D galaxy-focused exploration
 */
export type ViewMode = 'all-galaxies' | 'galaxy-selected' | 'galaxy-stars';

/**
 * Complete view state for Map2D
 */
export interface Map2DViewState {
  /** Current view mode */
  mode: ViewMode;
  /** Selected galaxy (if any) */
  selectedGalaxy: GraphNode | null;
  /** Selected star (if any) */
  selectedStar: GraphNode | null;
  /** Saved zoom/pan state for restoration */
  previousZoom: { k: number; x: number; y: number } | null;
}

/**
 * Voronoi diagram computation result
 */
export interface VoronoiData {
  /** Delaunay triangulation for Voronoi computation */
  delaunay: any;  // d3-delaunay Delaunay type
  /** Voronoi diagram generated from Delaunay */
  voronoi: any;   // d3-delaunay Voronoi type
  /** Map of node ID to index in point array */
  nodeIndexMap: Map<string, number>;
}
