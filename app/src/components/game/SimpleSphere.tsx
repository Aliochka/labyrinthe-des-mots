import React, { useRef, useEffect } from 'react';
import { Vector3, InstancedMesh, Object3D, Color } from 'three';
import { useFrame } from '@react-three/fiber';
import type { WordNode } from '../../types/game';
import { galaxyColorToThree, isVoidGalaxy } from '../../utils/galaxyColors';

interface SimpleSphereProps {
  words: WordNode[];
  playerPosition: Vector3;
  onMeshReady?: (mesh: InstancedMesh | null) => void;
}

const tempObject = new Object3D();
const tempColor = new Color();
const VOID_COLOR = new Color(0xcccccc); // Lighter gray for better visibility

/**
 * SimpleSphere: Mid-range LOD rendering (100-500 units)
 * Renders words as colored spheres without labels for performance
 * Uses InstancedMesh for efficient GPU rendering
 */
export const SimpleSphere: React.FC<SimpleSphereProps> = ({
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
      const size = 1.0 + (word.importance || 0) * 1.4;

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
        tempColor.setHSL(hsl.h, Math.max(0.6, hsl.s), Math.max(0.5, Math.min(0.85, hsl.l + 0.25)));
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
    if (!meshRef.current || words.length === 0) return;

    words.forEach((word, i) => {
      // Calculate size based on importance (×2 increase for better visibility)
      // Base size: 1.0-2.4 units
      const size = 1.0 + (word.importance || 0) * 1.4;

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
        // Strong lightness boost for mid-range visibility
        const hsl = { h: 0, s: 0, l: 0 };
        baseColor.getHSL(hsl);
        // Ensure minimum lightness of 0.5, boost by 0.25
        tempColor.setHSL(hsl.h, Math.max(0.6, hsl.s), Math.max(0.5, Math.min(0.85, hsl.l + 0.25)));
      }
      meshRef.current!.setColorAt(i, tempColor);
    });

    meshRef.current.instanceMatrix.needsUpdate = true;
    if (meshRef.current.instanceColor) {
      meshRef.current.instanceColor.needsUpdate = true;
    }
  });

  if (words.length === 0) return null;

  return (
    <instancedMesh ref={meshRef} args={[undefined, undefined, words.length]}>
      <sphereGeometry args={[2.0, 12, 12]} />
      <meshBasicMaterial
        vertexColors
        toneMapped={false}
        depthTest={true}
        depthWrite={true}
        transparent={true}
        opacity={0.9}
      />
    </instancedMesh>
  );
};
