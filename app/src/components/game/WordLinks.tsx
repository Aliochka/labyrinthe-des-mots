import React, { useMemo } from 'react';
import * as THREE from 'three';
import type { WordNode } from '../../types/game';
import type { Vector3 } from 'three';
import type { NavigationEdge } from '../../hooks/useNavigationLinks';
import { sampleStarsForTethers, buildTetherCurve } from '../graph/Map3D/utils/samplingUtils';

interface WordLinksProps {
  edges: NavigationEdge[];
  nearbyNodes: WordNode[];
  galaxyPositions: Map<string, Vector3>;
  showLinks: boolean;
}

/**
 * WordLinks component renders all types of semantic/etymological links in Navigation view
 *
 * Renders 3 layers:
 * - SemanticLinks (cyan) - Direct semantic relationships
 * - EtymologyLinks (red) - Etymology relationships
 * - StarTethers (gray) - Curved lines from words to galaxy centers
 */
export const WordLinks: React.FC<WordLinksProps> = ({
  edges,
  nearbyNodes,
  galaxyPositions,
  showLinks,
}) => {
  if (!showLinks) return null;

  // Separate edges by type
  const semanticEdges = useMemo(() =>
    edges.filter(e => e.relationTypes.includes('SEMANTIC')),
    [edges]
  );

  const etymologyEdges = useMemo(() =>
    edges.filter(e => e.relationTypes.includes('ETYMOLOGY')),
    [edges]
  );

  console.log(`[WordLinks] Rendering ${semanticEdges.length} semantic, ${etymologyEdges.length} etymology edges, ${nearbyNodes.length} nearby nodes`);

  return (
    <group name="word-links">
      <SemanticLinks edges={semanticEdges} />
      <EtymologyLinks edges={etymologyEdges} />
      <StarTethers nodes={nearbyNodes} galaxyPositions={galaxyPositions} />
    </group>
  );
};

/**
 * SemanticLinks - Renders cyan lines for semantic relationships
 */
const SemanticLinks: React.FC<{ edges: NavigationEdge[] }> = ({ edges }) => {
  const material = useMemo(
    () => new THREE.LineBasicMaterial({
      color: 0x4ecdc4, // Cyan
      transparent: true,
      opacity: 0.2,
    }),
    []
  );

  if (edges.length === 0) return null;

  return (
    <group name="semantic-links">
      {edges.map((edge, idx) => {
        const points = new Float32Array([
          edge.source.position.x, edge.source.position.y, edge.source.position.z,
          edge.target.position.x, edge.target.position.y, edge.target.position.z,
        ]);

        const geometry = new THREE.BufferGeometry();
        geometry.setAttribute('position', new THREE.BufferAttribute(points, 3));

        return (
          <primitive key={`sem-${idx}`} object={new THREE.Line(geometry, material)} />
        );
      })}
    </group>
  );
};

/**
 * EtymologyLinks - Renders red lines for etymology relationships
 */
const EtymologyLinks: React.FC<{ edges: NavigationEdge[] }> = ({ edges }) => {
  const material = useMemo(
    () => new THREE.LineBasicMaterial({
      color: 0xff6b6b, // Red
      transparent: true,
      opacity: 0.3,
    }),
    []
  );

  if (edges.length === 0) return null;

  return (
    <group name="etymology-links">
      {edges.map((edge, idx) => {
        const points = new Float32Array([
          edge.source.position.x, edge.source.position.y, edge.source.position.z,
          edge.target.position.x, edge.target.position.y, edge.target.position.z,
        ]);

        const geometry = new THREE.BufferGeometry();
        geometry.setAttribute('position', new THREE.BufferAttribute(points, 3));

        return (
          <primitive key={`etym-${idx}`} object={new THREE.Line(geometry, material)} />
        );
      })}
    </group>
  );
};

/**
 * StarTethers - Renders curved gray lines from words to their galaxy centers
 * Uses sampling to limit to ~1500 tethers for performance
 */
const StarTethers: React.FC<{
  nodes: WordNode[];
  galaxyPositions: Map<string, Vector3>;
}> = ({ nodes, galaxyPositions }) => {
  const material = useMemo(
    () => new THREE.LineBasicMaterial({
      color: 0x666666, // Gray
      transparent: true,
      opacity: 0.2,
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
      console.log(`[StarTethers] Sampled ${sampled.length} nodes for tethers`);
      return sampled;
    } catch (error) {
      console.error('[StarTethers] Sampling failed:', error);
      return [];
    }
  }, [nodes]);

  if (sampledNodes.length === 0) return null;

  return (
    <group name="star-tethers">
      {sampledNodes.map((node: any) => {
        // Find the original WordNode to get galaxy
        const wordNode = nodes.find(n => n.id === node.id);
        const galaxyId = wordNode?.galaxy;

        if (!galaxyId || galaxyId === 'void') return null;

        const galaxyPos = galaxyPositions.get(galaxyId);
        if (!galaxyPos) return null;

        // Build curved tether from star to galaxy center
        const curve = buildTetherCurve(
          { x: node.x, y: node.y, z: node.z },
          { x: galaxyPos.x, y: galaxyPos.y, z: galaxyPos.z }
        );

        const points = curve.getPoints(16);
        const positions = new Float32Array(
          points.flatMap(p => [p.x, p.y, p.z])
        );

        const geometry = new THREE.BufferGeometry();
        geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));

        return (
          <primitive key={`tether-${node.id}`} object={new THREE.Line(geometry, material)} />
        );
      })}
    </group>
  );
};
