import type { GraphNode } from "../../../../types/graph";
import { idStr } from "./idUtils";

/**
 * Ensures that must-include nodes (selected, trail) are present in the sampled set
 * This function is critical for downsampling: even when we reduce 66k stars to 20k,
 * we must keep the selected node and trail nodes visible
 *
 * @param sampledNodes - The downsampled node array
 * @param allNodes - The complete node array before sampling
 * @param mustIncludeIds - Set of node IDs that must be included (selected + trail)
 * @returns Updated array with must-include nodes added if they were missing
 */
export function ensureIncludedNodes(
  sampledNodes: GraphNode[],
  allNodes: GraphNode[],
  mustIncludeIds: Set<string>
): GraphNode[] {
  if (!mustIncludeIds.size) return sampledNodes;

  const out = sampledNodes.slice();
  const outSet = new Set(out.map((n) => idStr(n.id)));

  const allById = new Map<string, GraphNode>();
  for (const n of allNodes) allById.set(idStr(n.id), n);

  for (const id of mustIncludeIds) {
    if (outSet.has(id)) continue;
    const n = allById.get(id);
    if (n) {
      out.push(n);
      outSet.add(id);
    }
  }
  return out;
}
