import React, { useRef } from 'react';
import { Vector3, InstancedMesh, Object3D, Color } from 'three';
import { useFrame } from '@react-three/fiber';
import type { WordNode } from '../../types/game';
import { galaxyColorToThree, isVoidGalaxy } from '../../utils/galaxyColors';

interface DistantStarsProps {
  words: WordNode[];
  playerPosition: Vector3;
}

const tempObject = new Object3D();
const tempColor = new Color();
const VOID_COLOR = new Color(0x999999);

export const DistantStars: React.FC<DistantStarsProps> = ({
  words,
  playerPosition: _playerPosition, // Not used after opacity fix
}) => {
  const meshRef = useRef<InstancedMesh>(null);

  // Update instance transforms every frame
  useFrame(() => {
    if (!meshRef.current) return;

    words.forEach((word, i) => {
      // Calculate size based on importance only (×2 increase for better visibility)
      // Base size: 0.3-1.6 units
      const size = 0.3 + (word.importance || 0) * 1.3;

      // Set position and scale
      tempObject.position.copy(word.position);
      tempObject.scale.set(size, size, size);
      tempObject.updateMatrix();
      meshRef.current!.setMatrixAt(i, tempObject.matrix);

      // Apply galaxy color with boosted lightness for better visibility at distance
      const galaxyId = word.galaxy || 'void';
      if (isVoidGalaxy(galaxyId)) {
        tempColor.copy(VOID_COLOR);
      } else {
        const baseColor = galaxyColorToThree(galaxyId);
        // Boost lightness to ensure colors remain visible at distance
        const hsl = { h: 0, s: 0, l: 0 };
        baseColor.getHSL(hsl);
        tempColor.setHSL(hsl.h, hsl.s, Math.min(0.7, hsl.l + 0.15));
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
      <sphereGeometry args={[1, 8, 8]} />
      <meshBasicMaterial
        vertexColors
        toneMapped={false}
        depthTest={true}
        depthWrite={true}
      />
    </instancedMesh>
  );
};
