import React, { useRef, useEffect } from 'react';
import { Vector3, InstancedMesh, Object3D, Color } from 'three';
import { useFrame } from '@react-three/fiber';
import type { WordNode } from '../../types/game';
import { galaxyColorToThree, isVoidGalaxy } from '../../utils/galaxyColors';

interface DistantStarsProps {
  words: WordNode[];
  playerPosition: Vector3;
  onMeshReady?: (mesh: InstancedMesh | null) => void;
}

const tempObject = new Object3D();
const tempColor = new Color();
const VOID_COLOR = new Color(0xcccccc); // Lighter gray for better visibility

/**
 * DistantStars: Far-range LOD rendering (500+ units)
 * Renders words as small colored points for distant objects
 * Uses InstancedMesh for efficient GPU rendering
 */
export const DistantStars: React.FC<DistantStarsProps> = ({
  words,
  playerPosition: _playerPosition, // Not used after opacity fix
  onMeshReady,
}) => {
  const meshRef = useRef<InstancedMesh>(null);

  // Notify parent when mesh is ready
  useEffect(() => {
    onMeshReady?.(meshRef.current);
  }, [onMeshReady]);

  // Initialize colors immediately when mesh/words are ready (prevents black flash)
  useEffect(() => {
    if (!meshRef.current || words.length === 0) return;

    words.forEach((word, i) => {
      // Calculate size based on importance
      const size = 0.3 + (word.importance || 0) * 1.3;

      // Set position and scale
      tempObject.position.copy(word.position);
      tempObject.scale.set(size, size, size);
      tempObject.updateMatrix();
      meshRef.current!.setMatrixAt(i, tempObject.matrix);

      // Apply galaxy color
      const galaxyId = word.galaxy || 'void';
      if (isVoidGalaxy(galaxyId)) {
        tempColor.copy(VOID_COLOR);
      } else {
        const baseColor = galaxyColorToThree(galaxyId);
        const hsl = { h: 0, s: 0, l: 0 };
        baseColor.getHSL(hsl);
        tempColor.setHSL(hsl.h, Math.max(0.7, hsl.s), Math.max(0.6, Math.min(0.9, hsl.l + 0.3)));
      }
      meshRef.current!.setColorAt(i, tempColor);
    });

    meshRef.current.instanceMatrix.needsUpdate = true;
    if (meshRef.current.instanceColor) {
      meshRef.current.instanceColor.needsUpdate = true;
    }
  }, [words]);

  // Update instance transforms every frame
  useFrame(() => {
    if (!meshRef.current) return;

    words.forEach((word, i) => {
      // Calculate size based on importance (×2 increase for better visibility)
      // Base size: 0.3-1.6 units
      const size = 0.3 + (word.importance || 0) * 1.3;

      // Set position and scale
      tempObject.position.copy(word.position);
      tempObject.scale.set(size, size, size);
      tempObject.updateMatrix();
      meshRef.current!.setMatrixAt(i, tempObject.matrix);

      // Apply galaxy color
      const galaxyId = word.galaxy || 'void';
      if (isVoidGalaxy(galaxyId)) {
        tempColor.copy(VOID_COLOR);
      } else {
        const baseColor = galaxyColorToThree(galaxyId);
        // Strong lightness boost to ensure colors remain visible at distance
        const hsl = { h: 0, s: 0, l: 0 };
        baseColor.getHSL(hsl);
        // Ensure minimum lightness of 0.6, boost by 0.3
        tempColor.setHSL(hsl.h, Math.max(0.7, hsl.s), Math.max(0.6, Math.min(0.9, hsl.l + 0.3)));
      }
      meshRef.current!.setColorAt(i, tempColor);
    });

    meshRef.current.instanceMatrix.needsUpdate = true;
    if (meshRef.current.instanceColor) {
      meshRef.current.instanceColor.needsUpdate = true;
    }
  });

  return (
    <instancedMesh ref={meshRef} args={[undefined, undefined, words.length]}>
      <sphereGeometry args={[2.0, 8, 8]} />
      <meshBasicMaterial
        vertexColors
        toneMapped={false}
        depthTest={true}
        depthWrite={true}
        transparent={true}
        opacity={0.85}
      />
    </instancedMesh>
  );
};
