/**
 * Voronoi cell drawing utilities for Map2D
 */

import type { GraphNode } from "../../../../types/graph";
import type { VoronoiResult } from "./voronoi";
import {
  IMPORTANCE_BASE,
  VORONOI_BASE_HUE,
  VORONOI_BASE_SAT,
  VORONOI_BASE_LIGHT,
  MIN_CELL_OPACITY,
  MAX_CELL_OPACITY,
  MIN_BORDER_WIDTH,
  BORDER_WIDTH_FACTOR,
  SELECTED_BORDER_WIDTH,
  EXPLORED_BORDER_WIDTH,
  EXPLORED_LIGHTNESS_BOOST,
  MIN_FONT_SIZE,
  MAX_FONT_SIZE,
  FONT_SIZE_FACTOR,
  TEXT_SHADOW_BLUR,
} from "../constants";

/**
 * Drawing context for Voronoi cells
 */
export interface VoronoiDrawContext {
  /** Voronoi computation result */
  voronoiData: VoronoiResult & { nodes: GraphNode[] };
  /** Currently selected node (for highlighting) */
  selectedNode: GraphNode | null;
  /** Set of explored node IDs (for highlighting) */
  exploredIdSet: Set<string>;
  /** All display nodes (for neighbor lookup) */
  displayNodes: GraphNode[];
}

/**
 * Draws a single Voronoi cell for a node
 * Renders filled cell with border, importance-based styling, and label
 *
 * @param node - Graph node to render
 * @param ctx - Canvas 2D context
 * @param globalScale - Current zoom level
 * @param nodeIndex - Index in Voronoi point array
 * @param drawContext - Drawing context with voronoi data, selection, etc.
 */
export function drawVoronoiCell(
  node: GraphNode & { density?: number },
  ctx: CanvasRenderingContext2D,
  globalScale: number,
  nodeIndex: number,
  drawContext: VoronoiDrawContext
): void {
  const { voronoiData, selectedNode, exploredIdSet, displayNodes } = drawContext;

  if (!voronoiData?.voronoi) return;

  const { voronoi, delaunay } = voronoiData;
  const k = Math.max(0.25, Math.min(globalScale, 4));

  const isSelected = selectedNode?.id === node.id;
  const isExplored = exploredIdSet.has(String(node.id));

  // Calculate importance from degree (connection count)
  const degree = (node as any).degree ?? 0;
  const importance = Math.min(degree / IMPORTANCE_BASE, 1);

  // Cell opacity: boost for zoom and exploration
  let cellAlpha = MIN_CELL_OPACITY + importance * 0.55;
  if (k > 1.5) cellAlpha *= 1.25;
  if (k > 3) cellAlpha *= 1.4;
  if (isExplored) cellAlpha *= 1.1;
  cellAlpha = Math.min(cellAlpha, MAX_CELL_OPACITY);

  // Color palette: brighter for higher importance
  let hue = VORONOI_BASE_HUE - importance * 50;
  let sat = VORONOI_BASE_SAT + importance * 30;
  let light = VORONOI_BASE_LIGHT + importance * 25;

  if (isExplored) {
    light += EXPLORED_LIGHTNESS_BOOST;
    sat += 10;
  }

  if (isSelected) {
    hue = 180;
    sat = 100;
    light = 60;
  }

  // Render cell path
  const cellPath = voronoi.renderCell(nodeIndex);
  if (!cellPath) return;

  ctx.save();
  ctx.fillStyle = `hsla(${hue}, ${sat}%, ${light}%, ${cellAlpha})`;

  // Border styling
  if (isSelected || isExplored) {
    ctx.strokeStyle = `rgba(76, 205, 196, 0.9)`;
    ctx.lineWidth = isSelected ? SELECTED_BORDER_WIDTH : EXPLORED_BORDER_WIDTH;
  } else {
    ctx.strokeStyle = `rgba(255, 255, 255, ${0.18 + importance * 0.25})`;
    ctx.lineWidth = MIN_BORDER_WIDTH + importance * BORDER_WIDTH_FACTOR;
  }

  const path = new Path2D(cellPath);
  ctx.fill(path);
  ctx.stroke(path);
  ctx.restore();

  // Calculate approximate cell radius via neighbors
  const baseNodes = voronoiData.nodes ?? displayNodes;
  const neighbors = Array.from(delaunay.neighbors(nodeIndex));
  let minDist = Infinity;

  for (const neighbor of neighbors) {
    const neighborIdx = neighbor as number;
    const neighborNode = baseNodes[neighborIdx];
    if (!neighborNode || neighborNode.x == null || neighborNode.y == null) {
      continue;
    }

    const dx = neighborNode.x - node.x!;
    const dy = neighborNode.y - node.y!;
    const dist = Math.sqrt(dx * dx + dy * dy);
    if (dist < minDist) minDist = dist;
  }

  const cellRadius = minDist < Infinity ? minDist / 2 : 50;

  // Label rendering
  const label = node.name ?? String(node.id);
  const baseSize = MIN_FONT_SIZE + importance * 10;
  const fontSize = Math.max(baseSize, Math.min(MAX_FONT_SIZE, cellRadius * FONT_SIZE_FACTOR));

  ctx.font = `${isSelected ? "bold " : ""}${fontSize}px Sans-Serif`;
  const textWidth = ctx.measureText(label).width;
  const canFitText = textWidth < cellRadius * 2.2;

  // Only show label if explored, selected, or text fits
  if (isExplored || isSelected || canFitText) {
    ctx.font = `${isSelected ? "bold " : ""}${fontSize}px Sans-Serif`;
    ctx.fillStyle = isSelected
      ? `rgba(255, 255, 255, 0.98)`
      : isExplored
      ? `rgba(255, 255, 255, 0.85)`
      : `rgba(255, 255, 255, ${0.65 + importance * 0.35})`;

    ctx.textAlign = "center";
    ctx.textBaseline = "middle";

    // Text shadow for selected/explored
    if (isSelected || isExplored) {
      ctx.shadowColor = "rgba(0,0,0,0.85)";
      ctx.shadowBlur = TEXT_SHADOW_BLUR;
    }

    ctx.fillText(label, node.x!, node.y!);
  }
}
