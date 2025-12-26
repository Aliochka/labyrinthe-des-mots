/**
 * View state management hook for Map2D
 * Manages the state machine for galaxy-focused exploration
 */

import { useState, useCallback, useRef, type RefObject } from "react";
import type { ViewMode } from "../types";
import type { GraphNode } from "../../../../types/graph";
import { ZOOM_FIT_DURATION } from "../constants";

/**
 * Saved zoom/pan state for restoration
 */
interface SavedZoomState {
  k: number;  // zoom scale
  x: number;  // pan x
  y: number;  // pan y
}

/**
 * Return type for useViewState hook
 */
export interface ViewStateResult {
  /** Current view mode */
  mode: ViewMode;
  /** Currently selected galaxy */
  selectedGalaxy: GraphNode | null;
  /** Set selected galaxy (triggers galaxy-selected mode) */
  setSelectedGalaxy: (node: GraphNode | null) => void;
  /** Enter galaxy-stars mode (shows only selected galaxy's stars) */
  enterGalaxyStars: () => void;
  /** Return to all-galaxies mode (restores zoom/pan) */
  returnToAllGalaxies: () => void;
}

/**
 * Hook for managing Map2D view state machine
 * Handles transitions between all-galaxies, galaxy-selected, and galaxy-stars modes
 * Saves and restores zoom/pan state when transitioning
 *
 * @param fgRef - Ref to ForceGraph2D instance (for camera control)
 * @returns View state and transition functions
 */
export function useViewState(
  fgRef: RefObject<any>
): ViewStateResult {
  const [mode, setMode] = useState<ViewMode>('all-galaxies');
  const [selectedGalaxy, setSelectedGalaxyState] = useState<GraphNode | null>(null);
  const savedZoomRef = useRef<SavedZoomState | null>(null);

  /**
   * Set selected galaxy and transition to galaxy-selected mode
   */
  const setSelectedGalaxy = useCallback((node: GraphNode | null) => {
    setSelectedGalaxyState(node);
    if (node) {
      setMode('galaxy-selected');
    } else if (mode === 'galaxy-selected') {
      setMode('all-galaxies');
    }
  }, [mode]);

  /**
   * Enter galaxy-stars mode: save zoom, show only selected galaxy's stars
   */
  const enterGalaxyStars = useCallback(() => {
    if (!selectedGalaxy) {
      console.warn('[useViewState] Cannot enter galaxy-stars: no galaxy selected');
      return;
    }

    // Save current zoom/pan state
    const fg = fgRef.current;
    if (fg) {
      try {
        const transform = fg.d3Force?.('zoom')?.transform();
        if (transform) {
          savedZoomRef.current = {
            k: transform.k ?? 1,
            x: transform.x ?? 0,
            y: transform.y ?? 0,
          };
          console.log('[useViewState] Saved zoom state:', savedZoomRef.current);
        }
      } catch (e) {
        console.warn('[useViewState] Could not save zoom state:', e);
      }
    }

    setMode('galaxy-stars');

    // Zoom to fit stars after render
    requestAnimationFrame(() => {
      const fg = fgRef.current;
      if (fg && fg.zoomToFit) {
        console.log('[useViewState] Zooming to fit galaxy stars');
        fg.zoomToFit(ZOOM_FIT_DURATION);
      }
    });
  }, [selectedGalaxy, fgRef]);

  /**
   * Return to all-galaxies mode: restore zoom/pan state
   */
  const returnToAllGalaxies = useCallback(() => {
    console.log('[useViewState] Returning to all-galaxies mode');

    setMode('all-galaxies');
    setSelectedGalaxyState(null);

    // Restore saved zoom/pan
    requestAnimationFrame(() => {
      const fg = fgRef.current;
      if (fg && savedZoomRef.current) {
        const { k, x, y } = savedZoomRef.current;
        console.log('[useViewState] Restoring zoom state:', { k, x, y });

        try {
          // Restore zoom scale
          if (fg.zoom) {
            fg.zoom(k, 0);  // 0 duration for instant
          }

          // Restore pan position
          if (fg.centerAt) {
            fg.centerAt(x, y, 0);  // 0 duration for instant
          }
        } catch (e) {
          console.warn('[useViewState] Could not restore zoom state:', e);
        }
      }
    });
  }, [fgRef]);

  return {
    mode,
    selectedGalaxy,
    setSelectedGalaxy,
    enterGalaxyStars,
    returnToAllGalaxies,
  };
}
