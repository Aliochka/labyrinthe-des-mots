import React from 'react';
import { Text } from '@react-three/drei';
import type { Vector3 } from 'three';
import { galaxyColorToThree } from '../../utils/galaxyColors';

interface GalaxyCentersProps {
  galaxyPositions: Map<string, Vector3>;
  galaxyData: Map<string, any>; // Full galaxy data with names
}

/**
 * GalaxyCenters component renders galaxy center spheres in Navigation view
 *
 * Displays larger colored spheres at galaxy centers to make them visible
 * and help with spatial orientation in the 3D space.
 */
export const GalaxyCenters: React.FC<GalaxyCentersProps> = ({ galaxyPositions, galaxyData }) => {
  if (galaxyPositions.size === 0) return null;

  return (
    <group name="galaxy-centers">
      {Array.from(galaxyPositions.entries()).map(([galaxyId, position]) => {
        const galaxy = galaxyData.get(galaxyId);
        return (
          <GalaxyCenter
            key={galaxyId}
            galaxyId={galaxyId}
            position={position}
            galaxyName={galaxy?.name || galaxyId}
          />
        );
      })}
    </group>
  );
};

/**
 * Individual galaxy center sphere
 */
const GalaxyCenter: React.FC<{
  galaxyId: string;
  position: Vector3;
  galaxyName: string;
}> = ({ galaxyId, position, galaxyName }) => {
  const color = galaxyColorToThree(galaxyId);

  // Larger radius for galaxy centers to make them visible from distance
  const radius = 8;

  // Create galaxy data object for click detection
  const galaxyData = {
    id: galaxyId,
    name: galaxyName,
    type: 'galaxy',
  };

  return (
    <group position={[position.x, position.y, position.z]}>
      {/* Sphere */}
      <mesh userData={{ galaxy: galaxyData }}>
        <sphereGeometry args={[radius, 16, 16]} />
        <meshStandardMaterial
          color={color}
          emissive={color}
          emissiveIntensity={0.3}
          transparent={true}
          opacity={0.7}
        />
      </mesh>

      {/* Label */}
      <Text
        position={[0, radius + 2, 0]}
        fontSize={3}
        color={color}
        anchorX="center"
        anchorY="bottom"
        outlineWidth={0.3}
        outlineColor="#000000"
      >
        {galaxyName}
      </Text>
    </group>
  );
};
