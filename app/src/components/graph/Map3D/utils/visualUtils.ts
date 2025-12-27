import * as THREE from "three";
import {
  GOLDEN_ANGLE,
  GALAXY_CENTER_RADIUS,
  GALAXY_CENTER_OPACITY,
  STAR_LEVEL_SCALE,
  STAR_BASE_RADIUS,
  SELECTION_COLOR,
  SELECTION_SCALE,
} from "../constants";

/**
 * Visual properties for a node (radius, color, opacity)
 */
export interface NodeVisual {
  radius: number;
  color: THREE.Color;
  opacity: number;
}

/**
 * Generates a unique and stable color for each galaxy
 * Uses golden angle (137.5°) for optimal distribution across the color wheel
 * @param galaxyId - Galaxy identifier (e.g., "gc_0", "gc_1")
 * @returns THREE.Color with HSL-based coloring
 */
export function getGalaxyColor(galaxyId: string): THREE.Color {
  // Extraire le numéro de la galaxie (ex: "gc_0" -> 0)
  const match = galaxyId.match(/\d+/);
  const num = match ? parseInt(match[0]) : 0;

  // Distribuer les teintes sur 360° pour 46 galaxies
  const hue = (num * GOLDEN_ANGLE) % 360 / 360;  // Golden angle pour meilleure distribution
  const saturation = 0.85;  // Couleurs vives
  const lightness = 0.55;   // Ni trop sombre, ni trop clair

  const color = new THREE.Color();
  color.setHSL(hue, saturation, lightness);
  return color;
}

/**
 * Computes visual properties for galaxy center nodes
 * @param node - Graph node representing a galaxy center
 * @param showGalaxies - Whether galaxies should be fully visible or dimmed
 * @returns Visual properties with large radius and galaxy-specific color
 */
export function computeGalaxyCenterVisual(node: any, showGalaxies: boolean = true): NodeVisual {
  // Centres de galaxies : plus gros, couleur de leur galaxie
  const radius = GALAXY_CENTER_RADIUS;  // Beaucoup plus gros que les stars
  const color = showGalaxies ? getGalaxyColor(node.id) : new THREE.Color(0x111111);  // Gris très sombre si masquées
  const opacity = showGalaxies ? GALAXY_CENTER_OPACITY : 0.08;  // Très transparent si masquées
  return { radius, color, opacity };
}

/**
 * Computes visual properties for star nodes
 * Handles both galaxy centers and regular stars with density-based sizing
 * @param node - Graph node (can be galaxy center or star)
 * @param isSelected - Whether this node is currently selected
 * @param galaxyId - Optional galaxy ID for coloring stars by their galaxy
 * @param showStars - Whether stars should be fully visible or dimmed
 * @param showGalaxies - Whether galaxy centers should be fully visible or dimmed
 * @returns Visual properties with appropriate radius, color, and opacity
 */
export function computeStarVisual(
  node: any,
  isSelected: boolean,
  galaxyId?: string,
  showStars: boolean = true,
  showGalaxies: boolean = true
): NodeVisual {
  // Si c'est un centre de galaxie
  if (node.__isGalaxyCenter) {
    return computeGalaxyCenterVisual(node, showGalaxies);
  }

  // Calculer densité/intensité pour le rayon
  const d = node.density ?? 0;
  const deg = node.degree ?? 0;
  const intensityFromDeg = Math.min(1, Math.log10(deg + 2) / 2);
  const density = d > 0 ? d : intensityFromDeg;

  const baseR = STAR_BASE_RADIUS * STAR_LEVEL_SCALE;
  const intensity = 0.35 + 0.65 * density;

  const radius = isSelected
    ? (baseR + intensity * 1.1) * SELECTION_SCALE
    : baseR + intensity * 1.1;

  const color = new THREE.Color();
  if (isSelected) {
    color.set(SELECTION_COLOR);  // Cyan pour sélection
  } else if (!showStars) {
    // Étoiles masquées : gris très sombre
    color.set(0x111111);
  } else if (galaxyId !== undefined && galaxyId !== 'void') {
    // Couleur unique par galaxie (normalisée en string)
    color.copy(getGalaxyColor(galaxyId));
  } else {
    // Couleur par densité pour les nœuds isolés (void)
    color.setHSL(0.78 - 0.3 * intensity, 1, 0.45 + 0.3 * intensity);
  }

  const opacity = isSelected ? 1.0 : showStars ? (0.55 + 0.45 * intensity) : 0.08;
  return { radius, color, opacity };
}
