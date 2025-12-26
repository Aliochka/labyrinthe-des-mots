import { useRef, useEffect } from "react";
import * as THREE from "three";
import { GALAXY_MAT_POOL_SIZE } from "../constants";

/**
 * Return type for useGalaxyMaterials hook
 */
export interface GalaxyMaterialsResult {
  /** Shared sphere geometry for all galaxy nodes (1 geometry reused) */
  galaxyGeomRef: React.MutableRefObject<THREE.SphereGeometry | null>;
  /** Pool of reusable materials (prevents GPU memory leaks) */
  galaxyMatPoolRef: React.MutableRefObject<THREE.MeshBasicMaterial[]>;
  /** Temporary color object for material color updates (avoids allocations) */
  galaxyTempColorRef: React.MutableRefObject<THREE.Color>;
}

/**
 * Hook for managing shared galaxy rendering resources
 *
 * Creates a single shared SphereGeometry and a pool of reusable materials
 * to prevent GPU memory leaks when rendering thousands of galaxy nodes.
 *
 * GPU Memory Safety:
 * - Single shared geometry instead of creating one per node
 * - Material pool (64 materials max) reused via hash-based indexing
 * - Proper cleanup on unmount to prevent memory leaks
 *
 * @returns Refs to shared geometry, material pool, and temp color object
 */
export function useGalaxyMaterials(): GalaxyMaterialsResult {
  const galaxyGeomRef = useRef<THREE.SphereGeometry | null>(null);
  const galaxyMatPoolRef = useRef<THREE.MeshBasicMaterial[]>([]);
  const galaxyTempColorRef = useRef(new THREE.Color());

  useEffect(() => {
    // Shared geometry for all galaxy nodes
    galaxyGeomRef.current = new THREE.SphereGeometry(1, 12, 12);

    // Pool materials to avoid allocating per-node
    galaxyMatPoolRef.current = Array.from({ length: GALAXY_MAT_POOL_SIZE }, () => {
      return new THREE.MeshBasicMaterial({ transparent: true });
    });

    return () => {
      // Cleanup on unmount
      galaxyGeomRef.current?.dispose();
      galaxyGeomRef.current = null;

      for (const m of galaxyMatPoolRef.current) m.dispose();
      galaxyMatPoolRef.current = [];
    };
  }, []);

  return {
    galaxyGeomRef,
    galaxyMatPoolRef,
    galaxyTempColorRef,
  };
}
