import React, { useMemo, useRef } from 'react';
import { Vector3, InstancedMesh, Object3D, Color } from 'three';
import { useFrame } from '@react-three/fiber';
import type { WordNode } from '../../types/game';

interface DistantStarsProps {
  words: WordNode[];
  playerPosition: Vector3;
}

const tempObject = new Object3D();
const tempColor = new Color();

export const DistantStars: React.FC<DistantStarsProps> = ({
  words,
  playerPosition,
}) => {
  const meshRef = useRef<InstancedMesh>(null);

  // Update instance transforms every frame
  useFrame(() => {
    if (!meshRef.current) return;

    words.forEach((word, i) => {
      const distance = playerPosition.distanceTo(word.position);

      // Calculate size based on distance (closer = bigger)
      // At 50 units: size 0.8, at 500 units: size 0.15
      const size = Math.max(0.15, Math.min(0.8, 1 - (distance - 50) / 450));

      // Calculate opacity based on distance (closer = brighter)
      const opacity = Math.max(0.3, Math.min(1.0, 1 - (distance - 50) / 450));

      // Set position and scale
      tempObject.position.copy(word.position);
      tempObject.scale.set(size, size, size);
      tempObject.updateMatrix();
      meshRef.current!.setMatrixAt(i, tempObject.matrix);

      // Set color with opacity (using alpha channel)
      tempColor.setRGB(opacity, opacity, opacity);
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
      <meshBasicMaterial color="#ffffff" />
    </instancedMesh>
  );
};
