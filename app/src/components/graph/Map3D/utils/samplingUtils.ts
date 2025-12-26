import * as THREE from "three";
import type { GraphNode, StarNode } from "../../../../types/graph";
import { simpleHash } from "./hashUtils";
import { TARGET_SAMPLE_SIZE, TETHER_CURVE_CONFIG } from "../constants";

/**
 * Samples stars for tether visualization using stable hash-based sampling
 * Always includes selected node and trail nodes, then samples ~1500 additional stars
 * from the remaining set using a deterministic hash function
 *
 * @param nodes - All currently displayed nodes
 * @param selectedNode - Currently selected node (always included)
 * @param trailIds - IDs of nodes in the discovery trail (always included)
 * @param starIndex - Index mapping starId → StarNode for galaxy verification
 * @returns Sampled list of stars to display as tethers (~1500 stars)
 */
export function sampleStarsForTethers(
  nodes: GraphNode[],
  selectedNode: GraphNode | null,
  trailIds: string[],
  starIndex: Map<string, StarNode>
): GraphNode[] {
  const sampled: GraphNode[] = [];
  const includedIds = new Set<string>();

  // 1. TOUJOURS inclure selectedNode
  if (selectedNode) {
    sampled.push(selectedNode);
    includedIds.add(String(selectedNode.id));
  }

  // 2. TOUJOURS inclure le trail
  for (const id of trailIds) {
    const node = nodes.find(n => String(n.id) === id);
    if (node && !includedIds.has(id)) {
      sampled.push(node);
      includedIds.add(id);
    }
  }

  // 3. Échantillonner le reste avec hash stable
  const threshold = TARGET_SAMPLE_SIZE / nodes.length;  // ~5%

  for (const node of nodes) {
    const id = String(node.id);

    // Skip si déjà inclus
    if (includedIds.has(id)) continue;

    // Skip void stars (normaliser galaxyId en string)
    const star = starIndex.get(id);
    const galaxyId = star?.galaxy != null ? String(star.galaxy) : undefined;
    if (!star || galaxyId === 'void') continue;

    // Sampling stable basé sur hash du starId
    const hash = simpleHash(id);
    const normalized = (hash % 10000) / 10000;  // [0, 1]

    if (normalized < threshold) {
      sampled.push(node);
      includedIds.add(id);
    }
  }

  console.log(`[sampling] ${sampled.length} stars sampled from ${nodes.length} total`);
  return sampled;
}

/**
 * Builds a curved CatmullRom spline from star S to galaxy center G
 * Creates a smooth arc with an intermediate point H offset perpendicular to S→G
 *
 * Algorithm:
 * 1. Calculate intermediate point H = lerp(S, G, 0.55)
 * 2. Find perpendicular vector to S→G using cross product
 * 3. Offset H by amplitude (8% of distance, capped 10-40 units)
 * 4. Create smooth curve through points [S, H, G]
 *
 * @param starPos - Position of the star {x, y, z}
 * @param galaxyPos - Position of the galaxy center {x, y, z}
 * @returns THREE.CatmullRomCurve3 for rendering tether
 */
export function buildTetherCurve(
  starPos: { x: number; y: number; z: number },
  galaxyPos: { x: number; y: number; z: number }
): THREE.CatmullRomCurve3 {
  const S = new THREE.Vector3(starPos.x, starPos.y, starPos.z);
  const G = new THREE.Vector3(galaxyPos.x, galaxyPos.y, galaxyPos.z);

  // Point intermédiaire H = lerp(S, G, 0.55) + perpendicular offset
  const H = new THREE.Vector3().lerpVectors(S, G, TETHER_CURVE_CONFIG.LERP_FACTOR);

  // Calculer un vecteur perpendiculaire à S→G
  const SG = new THREE.Vector3().subVectors(G, S);
  const distance = SG.length();

  // Trouver un axe perpendiculaire (crossprod avec un vecteur arbitraire)
  const arbitrary = new THREE.Vector3(1, 0, 0);
  if (Math.abs(SG.dot(arbitrary)) > 0.9) {
    arbitrary.set(0, 1, 0);  // Éviter colinéarité
  }
  const perp = new THREE.Vector3().crossVectors(SG, arbitrary).normalize();

  // Amplitude du décalage : fonction de la distance, cappée
  const amplitude = Math.min(
    Math.max(
      distance * TETHER_CURVE_CONFIG.AMPLITUDE_FACTOR,
      TETHER_CURVE_CONFIG.MIN_AMPLITUDE
    ),
    TETHER_CURVE_CONFIG.MAX_AMPLITUDE
  );

  // Décaler H perpendiculairement
  H.addScaledVector(perp, amplitude);

  // Courbe CatmullRom à travers S, H, G
  return new THREE.CatmullRomCurve3(
    [S, H, G],
    false,
    'catmullrom',
    TETHER_CURVE_CONFIG.CURVE_TENSION
  );
}
