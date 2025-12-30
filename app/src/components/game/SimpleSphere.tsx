import React, { useRef } from 'react';
import { Vector3, InstancedMesh, Object3D, Color } from 'three';
import { useFrame } from '@react-three/fiber';
import type { WordNode } from '../../types/game';
import { galaxyColorToThree, isVoidGalaxy } from '../../utils/galaxyColors';

interface SimpleSphereProps {
  words: WordNode[];
  playerPosition: Vector3;
}

const tempObject = new Object3D();
const tempColor = new Color();
const VOID_COLOR = new Color(0x999999);

/**
 * SimpleSphere: Mid-range LOD rendering (100-300 units)
 * Renders words as colored spheres without labels for performance
 * Uses InstancedMesh for efficient GPU rendering
 */
export const SimpleSphere: React.FC<SimpleSphereProps> = ({
  words,
  playerPosition: _playerPosition, // Not used after opacity fix
}) => {
  const meshRef = useRef<InstancedMesh>(null);

  // Update instance transforms every frame
  useFrame(() => {
    if (!meshRef.current || words.length === 0) return;

    words.forEach((word, i) => {
      // Calculate size based on importance only (×2 increase for better visibility)
      // Base size: 1.0-2.4 units
      const size = 1.0 + (word.importance || 0) * 1.4;

      // Set position and scale
      tempObject.position.copy(word.position);
      tempObject.scale.set(size, size, size);
      tempObject.updateMatrix();
      meshRef.current!.setMatrixAt(i, tempObject.matrix);

      // Apply galaxy color (full color, no darkening)
      const galaxyId = word.galaxy || 'void';
      const baseColor = isVoidGalaxy(galaxyId)
        ? VOID_COLOR
        : galaxyColorToThree(galaxyId);

      tempColor.copy(baseColor);
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
      <sphereGeometry args={[1, 12, 12]} />
      <meshBasicMaterial
        vertexColors
        transparent={true}
        opacity={0.95}
        depthTest={true}
        depthWrite={true}
      />
    </instancedMesh>
  );
};
