import React, { useMemo } from 'react';
import * as THREE from 'three';
import type { WordNode } from '../../types/game';
import type { Vector3 } from 'three';
import type { NavigationEdge } from '../../hooks/useNavigationLinks';
import { sampleStarsForTethers, buildTetherCurve } from '../graph/Map3D/utils/samplingUtils';

// Scale factor for galaxy positions (must match Navigation.tsx)
const SCALE_FACTOR = 10;

interface WordLinksProps {
  edges: NavigationEdge[];
  nearbyNodes: WordNode[];
  galaxyPositions: Map<string, Vector3>;
  galaxyBundles: any[];
  showLinks: boolean;
  enabledRelationTypes: Set<string>;
}

/**
 * WordLinks component renders all types of semantic/etymological links in Navigation view
 *
 * Renders 4 layers:
 * - SemanticLinks (cyan) - Direct semantic relationships
 * - EtymologyLinks (red) - Etymology relationships
 * - StarTethers (gray) - Curved lines from words to galaxy centers
 * - GalaxyBundles (yellow) - Inter-galaxy connections
 */
export const WordLinks: React.FC<WordLinksProps> = ({
  edges,
  nearbyNodes,
  galaxyPositions,
  galaxyBundles,
  showLinks,
  enabledRelationTypes,
}) => {
  if (!showLinks) return null;

  // Separate edges by type and filter by enabled types
  const semanticEdges = useMemo(() =>
    enabledRelationTypes.has('SEMANTIC')
      ? edges.filter(e => e.relationTypes.includes('SEMANTIC'))
      : [],
    [edges, enabledRelationTypes]
  );

  const etymologyEdges = useMemo(() =>
    enabledRelationTypes.has('ETYMOLOGY')
      ? edges.filter(e => e.relationTypes.includes('ETYMOLOGY'))
      : [],
    [edges, enabledRelationTypes]
  );

  return (
    <group name="word-links">
      <SemanticLinks edges={semanticEdges} />
      <EtymologyLinks edges={etymologyEdges} />
      <StarTethers nodes={nearbyNodes} galaxyPositions={galaxyPositions} />
      <GalaxyBundles bundles={galaxyBundles} enabledRelationTypes={enabledRelationTypes} />
    </group>
  );
};

/**
 * SemanticLinks - Renders cyan lines for semantic relationships
 * Uses LineSegments for efficient rendering of multiple edges
 */
const SemanticLinks: React.FC<{ edges: NavigationEdge[] }> = ({ edges }) => {
  const material = useMemo(
    () => new THREE.LineBasicMaterial({
      color: 0x4ecdc4, // Cyan
      transparent: true,
      opacity: 0.35, // Increased for better visibility
    }),
    []
  );

  // Memoize geometry to avoid recreating every render (performance optimization)
  const geometry = useMemo(() => {
    if (edges.length === 0) return null;

    // Create single BufferGeometry with all line segments
    const positions = new Float32Array(edges.length * 6); // 2 points × 3 coords per edge

    edges.forEach((edge, i) => {
      const offset = i * 6;
      positions[offset + 0] = edge.source.position.x;
      positions[offset + 1] = edge.source.position.y;
      positions[offset + 2] = edge.source.position.z;
      positions[offset + 3] = edge.target.position.x;
      positions[offset + 4] = edge.target.position.y;
      positions[offset + 5] = edge.target.position.z;
    });

    const geom = new THREE.BufferGeometry();
    geom.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    return geom;
  }, [edges]);

  if (!geometry) return null;

  return (
    <lineSegments name="semantic-links" geometry={geometry} material={material} />
  );
};

/**
 * EtymologyLinks - Renders red lines for etymology relationships
 * Uses LineSegments for efficient rendering of multiple edges
 */
const EtymologyLinks: React.FC<{ edges: NavigationEdge[] }> = ({ edges }) => {
  const material = useMemo(
    () => new THREE.LineBasicMaterial({
      color: 0xff6b6b, // Red
      transparent: true,
      opacity: 0.35, // Increased for better visibility
    }),
    []
  );

  // Memoize geometry to avoid recreating every render (performance optimization)
  const geometry = useMemo(() => {
    if (edges.length === 0) return null;

    // Create single BufferGeometry with all line segments
    const positions = new Float32Array(edges.length * 6); // 2 points × 3 coords per edge

    edges.forEach((edge, i) => {
      const offset = i * 6;
      positions[offset + 0] = edge.source.position.x;
      positions[offset + 1] = edge.source.position.y;
      positions[offset + 2] = edge.source.position.z;
      positions[offset + 3] = edge.target.position.x;
      positions[offset + 4] = edge.target.position.y;
      positions[offset + 5] = edge.target.position.z;
    });

    const geom = new THREE.BufferGeometry();
    geom.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    return geom;
  }, [edges]);

  if (!geometry) return null;

  return (
    <lineSegments name="etymology-links" geometry={geometry} material={material} />
  );
};

/**
 * StarTethers - Renders curved gray lines from words to their galaxy centers
 * Uses sampling to limit to ~3000 tethers for performance (increased from 1500)
 * Uses LineSegments for efficient rendering of all tethers
 */
const StarTethers: React.FC<{
  nodes: WordNode[];
  galaxyPositions: Map<string, Vector3>;
}> = ({ nodes, galaxyPositions }) => {
  const material = useMemo(
    () => new THREE.LineBasicMaterial({
      color: 0x888888, // Lighter gray
      transparent: true,
      opacity: 0.25, // Increased for better visibility
    }),
    []
  );

  // Sample ~1500 nodes using Map3D's sampling algorithm
  const sampledNodes = useMemo(() => {
    if (nodes.length === 0) return [];

    // Adapt WordNode → GraphNode format for sampling
    const graphNodes = nodes.map(n => ({
      id: n.id,
      x: n.position.x,
      y: n.position.y,
      z: n.position.z,
    }));

    // Build starIndex for galaxy membership
    const starIndex = new Map(
      nodes.map(n => [n.id, { galaxy: n.galaxy }])
    );

    try {
      const sampled = sampleStarsForTethers(
        graphNodes as any,
        null, // No selected node in Navigation
        [], // No trail
        starIndex as any
      );
      return sampled;
    } catch (error) {
      console.error('[StarTethers] Sampling failed:', error);
      return [];
    }
  }, [nodes]);

  // Memoize geometry to avoid recreating every render (performance optimization)
  const geometry = useMemo(() => {
    if (sampledNodes.length === 0) return null;

    const tetherCurves: Float32Array[] = [];

    sampledNodes.forEach((node: any) => {
      // Find the original WordNode to get galaxy
      const wordNode = nodes.find(n => n.id === node.id);
      const galaxyId = wordNode?.galaxy;

      if (!galaxyId || galaxyId === 'void') return;

      const galaxyPos = galaxyPositions.get(galaxyId);
      if (!galaxyPos) return;

      // Build curved tether from star to galaxy center
      const curve = buildTetherCurve(
        { x: node.x, y: node.y, z: node.z },
        { x: galaxyPos.x, y: galaxyPos.y, z: galaxyPos.z }
      );

      const points = curve.getPoints(16);

      // Convert curve points to line segments (16 points = 15 segments = 30 vertices)
      const segmentPositions = new Float32Array((points.length - 1) * 6);
      for (let i = 0; i < points.length - 1; i++) {
        const offset = i * 6;
        segmentPositions[offset + 0] = points[i].x;
        segmentPositions[offset + 1] = points[i].y;
        segmentPositions[offset + 2] = points[i].z;
        segmentPositions[offset + 3] = points[i + 1].x;
        segmentPositions[offset + 4] = points[i + 1].y;
        segmentPositions[offset + 5] = points[i + 1].z;
      }

      tetherCurves.push(segmentPositions);
    });

    if (tetherCurves.length === 0) return null;

    // Combine all tether segments into single geometry
    const totalLength = tetherCurves.reduce((sum, arr) => sum + arr.length, 0);
    const allPositions = new Float32Array(totalLength);
    let offset = 0;
    tetherCurves.forEach(positions => {
      allPositions.set(positions, offset);
      offset += positions.length;
    });

    const geom = new THREE.BufferGeometry();
    geom.setAttribute('position', new THREE.BufferAttribute(allPositions, 3));
    return geom;
  }, [sampledNodes, nodes, galaxyPositions]);

  if (!geometry) return null;

  return (
    <lineSegments name="star-tethers" geometry={geometry} material={material} />
  );
};

/**
 * GalaxyBundles - Renders yellow curved lines between galaxy centers
 * Shows inter-galaxy semantic connections
 */
const GalaxyBundles: React.FC<{
  bundles: any[];
  enabledRelationTypes: Set<string>;
}> = ({ bundles, enabledRelationTypes }) => {
  // Only show if SEMANTIC relation type is enabled
  if (!enabledRelationTypes.has('SEMANTIC')) return null;
  if (!bundles || bundles.length === 0) return null;

  const material = useMemo(
    () => new THREE.LineBasicMaterial({
      color: 0xffd296, // Yellow (same as Map3D)
      transparent: true,
      opacity: 0.45, // Increased for better visibility
    }),
    []
  );

  // Memoize line objects to avoid recreating geometries every render (performance optimization)
  const lineObjects = useMemo(() => {
    return bundles.map((route: any, idx: number) => {
      if (!route.points || route.points.length < 2) return null;

      // Create CatmullRom curve from points, scaled to match galaxy positions
      const curve = new THREE.CatmullRomCurve3(
        route.points.map((p: number[]) => new THREE.Vector3(p[0] * SCALE_FACTOR, p[1] * SCALE_FACTOR, p[2] * SCALE_FACTOR)),
        false,
        'catmullrom',
        0.6
      );

      const points = curve.getPoints(24);
      const positions = new Float32Array(
        points.flatMap(p => [p.x, p.y, p.z])
      );

      const geometry = new THREE.BufferGeometry();
      geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));

      return {
        key: `bundle-${idx}`,
        line: new THREE.Line(geometry, material)
      };
    }).filter(Boolean);
  }, [bundles, material]);

  return (
    <group name="galaxy-bundles">
      {lineObjects.map((obj) => (
        <primitive key={obj!.key} object={obj!.line} />
      ))}
    </group>
  );
};
