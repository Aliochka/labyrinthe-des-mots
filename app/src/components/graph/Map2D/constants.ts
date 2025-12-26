/**
 * Configuration constants for Map2D component
 */

// ===== RENDERING LIMITS =====
/** Maximum number of nodes to render (downsampling threshold) */
export const MAX_NODES_2D = 15000;

// ===== COORDINATE NORMALIZATION =====
/** Padding factor for normalized coordinates (90% of canvas) */
export const NORMALIZE_PADDING = 0.9;

// ===== VORONOI RENDERING =====
/** Base importance threshold for calculating visual properties */
export const IMPORTANCE_BASE = 500;

/** HSL color base hue for Voronoi cells */
export const VORONOI_BASE_HUE = 210;

/** HSL color base saturation for Voronoi cells */
export const VORONOI_BASE_SAT = 55;

/** HSL color base lightness for Voronoi cells */
export const VORONOI_BASE_LIGHT = 45;

/** Minimum opacity for Voronoi cells */
export const MIN_CELL_OPACITY = 0.18;

/** Maximum opacity for Voronoi cells */
export const MAX_CELL_OPACITY = 0.9;

/** Border width scaling factor based on importance */
export const BORDER_WIDTH_FACTOR = 1.5;

/** Minimum border width */
export const MIN_BORDER_WIDTH = 0.7;

/** Maximum border width */
export const MAX_BORDER_WIDTH = 2.2;

/** Selected cell border width */
export const SELECTED_BORDER_WIDTH = 3;

/** Explored cell border width */
export const EXPLORED_BORDER_WIDTH = 2;

/** Lightness boost for explored cells */
export const EXPLORED_LIGHTNESS_BOOST = 10;

// ===== TEXT RENDERING =====
/** Minimum font size for labels */
export const MIN_FONT_SIZE = 10;

/** Maximum font size for labels */
export const MAX_FONT_SIZE = 32;

/** Font size scaling factor based on cell radius and importance */
export const FONT_SIZE_FACTOR = 0.6;

// ===== SELECTION & HIGHLIGHTING =====
/** Selection highlight color (HSL cyan) */
export const SELECTION_COLOR = 'hsl(180, 100%, 60%)';

/** Text shadow blur radius for selected/explored cells */
export const TEXT_SHADOW_BLUR = 4;

// ===== INITIALIZATION =====
/** Initial canvas fade-in delay (ms) */
export const INIT_FADE_DELAY = 300;

/** Canvas fade-in duration (ms) */
export const FADE_IN_DURATION = 600;

/** Initial zoom level */
export const INITIAL_ZOOM = 0.8;

// ===== KEYBOARD SHORTCUTS =====
/** Keys to enter galaxy-stars mode */
export const KEY_ENTER_GALAXY = [' ', 'Space'];

/** Keys to return to all-galaxies mode */
export const KEY_RETURN_MACRO = ['Escape'];

/** Debounce delay for keyboard events (ms) */
export const KEYBOARD_DEBOUNCE = 200;

// ===== CAMERA TRANSITIONS =====
/** Duration for zoomToFit animation (ms) */
export const ZOOM_FIT_DURATION = 400;
