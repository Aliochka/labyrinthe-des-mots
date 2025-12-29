// Configuration constants for Map3D component

// ===== RENDERING LIMITS =====
/** Maximum number of nodes to render (downsampling threshold) */
export const MAX_NODES_RENDER = 15000;

// ===== GPU MEMORY MANAGEMENT =====
/** Pool size for reusable galaxy materials (prevents GPU memory leaks) */
export const GALAXY_MAT_POOL_SIZE = 64;

// ===== DEBUG SETTINGS =====
/** Show debug panel (set to false in production) */
export const DEBUG_PANEL = true;

/** Show bounding box helper for scene debugging */
export const SHOW_BOUNDING_BOX_HELPER = false;

// ===== SAMPLING CONFIGURATION =====
/** Target number of stars to sample for tether visualization (~5% of 66k stars) */
export const TARGET_SAMPLE_SIZE = 1500;

// ===== LOD (LEVEL OF DETAIL) CONFIGURATION =====
/**
 * LOD distance factors for camera-based rendering transitions
 * - GALAXY_DISTANCE_FACTOR: Switch to galaxy-only view when camera is far
 * - STAR_DISTANCE_FACTOR: Show star details when camera is close
 */
export const LOD_RATIOS = {
  /** Threshold multiplier for galaxy-to-stars transition (radiusMean * 2.5) */
  GALAXY_DISTANCE_FACTOR: 2.5,
  /** Threshold multiplier for showing star links (radiusMean * 1.2) */
  STAR_DISTANCE_FACTOR: 1.2,
} as const;

// ===== VISUAL CONFIGURATION =====
// Note: GOLDEN_ANGLE moved to /app/src/utils/galaxyColors.ts (shared utility)

/** Radius for galaxy center nodes */
export const GALAXY_CENTER_RADIUS = 3.0;

/** Opacity for galaxy center nodes */
export const GALAXY_CENTER_OPACITY = 0.95;

/** Scale factor for star-level nodes */
export const STAR_LEVEL_SCALE = 0.4;

/** Base radius for star nodes */
export const STAR_BASE_RADIUS = 0.2;

/** Selection highlight color (cyan) */
export const SELECTION_COLOR = 0x4ecdc4;

/** Selection highlight scale multiplier */
export const SELECTION_SCALE = 1.8;

// ===== TETHER CURVE CONFIGURATION =====
/**
 * Configuration for star→galaxy tether curve generation
 * Tethers are curved lines connecting stars to their galaxy centers
 */
export const TETHER_CURVE_CONFIG = {
  /** Lerp factor for intermediate point H between star S and galaxy G */
  LERP_FACTOR: 0.55,
  /** Amplitude factor as percentage of distance */
  AMPLITUDE_FACTOR: 0.08,
  /** Minimum perpendicular offset amplitude */
  MIN_AMPLITUDE: 10,
  /** Maximum perpendicular offset amplitude */
  MAX_AMPLITUDE: 40,
  /** Curve tension for CatmullRom spline (0.5 = balanced) */
  CURVE_TENSION: 0.5,
  /** Number of points to sample along the curve */
  NUM_POINTS: 16,
} as const;

// ===== LAYER COLORS =====
/** Color for discovery path (trail) tube geometry */
export const DISCOVERY_PATH_COLOR = 0x00ffff;

/** Color for galaxy bundle routes */
export const GALAXY_BUNDLE_COLOR = 0xffd296;

/** Color for star tethers */
export const STAR_TETHER_COLOR = 0x666666;

/** Color for star backbone (MST + kNN hybrid) */
export const STAR_BACKBONE_COLOR = 0x4488ff;

/** Opacity for star backbone edges */
export const STAR_BACKBONE_OPACITY = 0.15;

// ===== CAMERA CONFIGURATION =====
/**
 * Camera and scene management settings
 */
export const CAMERA_CONFIG = {
  /** Interval in ms for saving camera state between levels */
  SAVE_INTERVAL_MS: 500,
  /** Interval in ms for tracking camera distance for LOD */
  DISTANCE_TRACKING_MS: 500,
  /** Duration in ms for fade-in animation when entering scene */
  FADE_IN_DURATION_MS: 600,
  /** Cap pixel ratio to prevent context lost on high-DPI displays */
  PIXEL_RATIO_CAP: 1,
} as const;
