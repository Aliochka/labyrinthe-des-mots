import React from 'react';
import { Vector3 } from 'three';
import { useFrame } from '@react-three/fiber';

interface PlayerProps {
  position: Vector3;
  velocity: Vector3;
}

export const Player: React.FC<PlayerProps> = ({ position, velocity }) => {
  const meshRef = React.useRef<THREE.Mesh>(null);

  // Update rotation each frame based on velocity
  useFrame(() => {
    if (meshRef.current && velocity.length() > 0.1) {
      const direction = velocity.clone().normalize();
      const target = position.clone().add(direction);
      meshRef.current.lookAt(target);
      meshRef.current.rotateX(Math.PI / 2);
    }
  });

  return (
    <mesh ref={meshRef} position={[position.x, position.y, position.z]}>
      {/* Cone geometry: radius, height, radialSegments - bigger size */}
      <coneGeometry args={[2, 4, 8]} />
      <meshBasicMaterial color="white" />
    </mesh>
  );
};
