/**
 * Star filtering utilities for galaxy-focused exploration
 */

import type { GraphNode } from "../../../../types/graph";
import type { GalaxyDataService } from "../../../../services/GalaxyDataService";
import { MAX_NODES_2D } from "../constants";

/**
 * Filters stars to show only members of a specific galaxy
 * Applies downsampling if galaxy has too many stars
 *
 * @param allStars - All star nodes
 * @param galaxyId - ID of galaxy to filter by
 * @param galaxyDataService - Service for galaxy membership lookup
 * @param maxNodes - Maximum nodes to return (downsampling threshold)
 * @returns Filtered array of stars belonging to the galaxy
 */
export function filterStarsByGalaxy(
  allStars: GraphNode[],
  galaxyId: string,
  galaxyDataService: GalaxyDataService,
  maxNodes: number = MAX_NODES_2D
): GraphNode[] {
  // Get member star IDs from galaxy service
  const memberIds = galaxyDataService.getGalaxyMembers(galaxyId);

  if (!memberIds.length) {
    console.warn(`[filterStarsByGalaxy] Galaxy ${galaxyId} has no members`);
    return [];
  }

  // Create Set for O(1) membership lookup
  const memberIdSet = new Set(memberIds);

  // Filter stars by membership
  let filtered = allStars.filter(star => memberIdSet.has(String(star.id)));

  console.log(`[filterStarsByGalaxy] Galaxy ${galaxyId}: ${filtered.length} stars (from ${memberIds.length} members)`);

  // Downsample if still too many
  if (filtered.length > maxNodes) {
    const step = Math.ceil(filtered.length / maxNodes);
    filtered = filtered.filter((_, i) => i % step === 0);
    console.log(`[filterStarsByGalaxy] Downsampled to ${filtered.length} stars (step=${step})`);
  }

  return filtered;
}
