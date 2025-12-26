/**
 * ID and link identifier utilities for graph nodes and edges
 */

/**
 * Converts any value to a string ID
 * @param v - Value to convert (can be string, number, object, or null/undefined)
 * @returns String representation of the value
 */
export function idStr(v: any): string {
  return String(v ?? "");
}

/**
 * Extracts the ID from a link endpoint (source or target)
 * Handles both primitive values and ForceGraph-mutated node objects
 * @param v - Link endpoint value (can be string, number, or node object)
 * @returns String ID of the endpoint
 */
export function linkEndId(v: any): string {
  if (v == null) return "";
  // si ForceGraph a muté en objet node
  if (typeof v === "object") return idStr((v as any).id);
  return idStr(v);
}

/**
 * Generates a stable, canonical ID for a graph link
 * Ensures that links A→B and B→A have the same ID (undirected behavior)
 * @param link - Graph link object with source, target, and optional relType
 * @returns Canonical link ID in format "smaller_id__larger_id__type"
 */
export function linkIdStable(link: any): string {
  // source/target peuvent être ids ou objets (ForceGraph)
  const s = linkEndId(link.source);
  const t = linkEndId(link.target);
  const type = idStr(link.relType ?? link.type ?? "");
  // on canonicalise pour éviter s-t vs t-s si tu veux un id "undirected"
  const a = s < t ? s : t;
  const b = s < t ? t : s;
  return `${a}__${b}__${type}`;
}
