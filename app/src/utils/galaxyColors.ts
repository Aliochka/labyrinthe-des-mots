/**
 * Galaxy Color Utilities
 *
 * Provides consistent galaxy colors across Map3D, Map2D, and Navigation views.
 * Uses golden angle (137.5°) for optimal color distribution across 46 galaxies.
 */

import * as THREE from "three";

/**
 * Golden angle constant for optimal color distribution
 * Distributes hues evenly across the color wheel
 */
export const GOLDEN_ANGLE = 137.5;

/**
 * Fixed saturation for galaxy colors (vivid colors)
 */
export const GALAXY_SATURATION = 0.85;

/**
 * Fixed lightness for galaxy colors (medium brightness)
 */
export const GALAXY_LIGHTNESS = 0.55;

/**
 * Neutral gray color for void nodes (nodes without galaxy membership)
 */
export const VOID_COLOR_HEX = '#999999';

/**
 * HSL color representation
 */
export interface HSLColor {
  /** Hue: 0-1 (normalized) */
  h: number;
  /** Saturation: 0-1 (normalized) */
  s: number;
  /** Lightness: 0-1 (normalized) */
  l: number;
}

/**
 * HSL color components (for canvas rendering)
 */
export interface HSLComponents {
  /** Hue: 0-360 degrees */
  hue: number;
  /** Saturation: 0-100% */
  sat: number;
  /** Lightness: 0-100% */
  light: number;
}

/**
 * Checks if a galaxy ID represents a void node (no galaxy membership)
 * @param galaxyId - Galaxy identifier (e.g., "gc_0", "void", undefined)
 * @returns true if the node is void (no galaxy)
 */
export function isVoidGalaxy(galaxyId: string | undefined): boolean {
  return !galaxyId || galaxyId === 'void';
}

/**
 * Extracts the galaxy number from a galaxy ID
 * @param galaxyId - Galaxy identifier (e.g., "gc_0" -> 0, "gc_23" -> 23)
 * @returns Galaxy number, or 0 if parsing fails
 */
function extractGalaxyNumber(galaxyId: string): number {
  const match = galaxyId.match(/\d+/);
  return match ? parseInt(match[0], 10) : 0;
}

/**
 * Generates a unique HSL color for a galaxy using golden angle distribution
 * @param galaxyId - Galaxy identifier (e.g., "gc_0", "gc_1")
 * @returns HSL color with normalized values (0-1)
 */
export function getGalaxyColorHSL(galaxyId: string): HSLColor {
  const num = extractGalaxyNumber(galaxyId);

  // Distribute hues across 360° using golden angle for optimal distribution
  const hue = (num * GOLDEN_ANGLE) % 360 / 360;

  return {
    h: hue,
    s: GALAXY_SATURATION,
    l: GALAXY_LIGHTNESS
  };
}

/**
 * Converts galaxy ID to THREE.Color (for Map3D WebGL rendering)
 * @param galaxyId - Galaxy identifier (e.g., "gc_0")
 * @returns THREE.Color object
 */
export function galaxyColorToThree(galaxyId: string): THREE.Color {
  const { h, s, l } = getGalaxyColorHSL(galaxyId);
  const color = new THREE.Color();
  color.setHSL(h, s, l);
  return color;
}

/**
 * Converts galaxy ID to HSL components (for Map2D canvas rendering)
 * Returns hue in degrees (0-360), saturation and lightness in percentages (0-100)
 * @param galaxyId - Galaxy identifier (e.g., "gc_0")
 * @returns HSL components for canvas rendering
 */
export function galaxyColorToHSLComponents(galaxyId: string): HSLComponents {
  const { h, s, l } = getGalaxyColorHSL(galaxyId);

  return {
    hue: h * 360,        // Convert to degrees
    sat: s * 100,        // Convert to percentage
    light: l * 100       // Convert to percentage
  };
}

/**
 * Converts HSL (0-1 normalized) to hex color string
 * @param h - Hue (0-1)
 * @param s - Saturation (0-1)
 * @param l - Lightness (0-1)
 * @returns Hex color string (e.g., "#4ecdc4")
 */
function hslToHex(h: number, s: number, l: number): string {
  // Convert HSL to RGB
  const hue = h * 360;
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const x = c * (1 - Math.abs((hue / 60) % 2 - 1));
  const m = l - c / 2;

  let r = 0, g = 0, b = 0;

  if (hue >= 0 && hue < 60) {
    r = c; g = x; b = 0;
  } else if (hue >= 60 && hue < 120) {
    r = x; g = c; b = 0;
  } else if (hue >= 120 && hue < 180) {
    r = 0; g = c; b = x;
  } else if (hue >= 180 && hue < 240) {
    r = 0; g = x; b = c;
  } else if (hue >= 240 && hue < 300) {
    r = x; g = 0; b = c;
  } else {
    r = c; g = 0; b = x;
  }

  // Convert to 0-255 range and format as hex
  const rHex = Math.round((r + m) * 255).toString(16).padStart(2, '0');
  const gHex = Math.round((g + m) * 255).toString(16).padStart(2, '0');
  const bHex = Math.round((b + m) * 255).toString(16).padStart(2, '0');

  return `#${rHex}${gHex}${bHex}`;
}

/**
 * Converts galaxy ID to hex color string (for Navigation React components)
 * @param galaxyId - Galaxy identifier (e.g., "gc_0")
 * @returns Hex color string (e.g., "#4ecdc4")
 */
export function galaxyColorToHex(galaxyId: string | undefined): string {
  if (isVoidGalaxy(galaxyId)) {
    return VOID_COLOR_HEX;
  }

  const { h, s, l } = getGalaxyColorHSL(galaxyId!);
  return hslToHex(h, s, l);
}
