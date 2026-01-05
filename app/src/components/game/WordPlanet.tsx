import React, { useMemo, useRef, useEffect } from 'react';
import { Text } from '@react-three/drei';
import type { WordNode } from '../../types/game';
import { Vector3, Color, Mesh, MeshBasicMaterial } from 'three';
import { galaxyColorToHex, isVoidGalaxy, VOID_COLOR_HEX } from '../../utils/galaxyColors';

interface WordPlanetProps {
  word: WordNode;
  playerPosition: Vector3;
  isDiscovered: boolean; // Keep for potential future use (proximity-based effects)
}

export const WordPlanet: React.FC<WordPlanetProps> = ({
  word,
  playerPosition,
  isDiscovered: _isDiscovered, // Unused - galaxy color system replaced discovery-based colors
}) => {
  const meshRef = useRef<Mesh>(null);

  // Calculate distance to player
  const distance = useMemo(() => {
    return playerPosition.distanceTo(word.position);
  }, [playerPosition, word.position]);

  // Debug: log if galaxy is undefined
  if (!word.galaxy) {
    console.warn('[WordPlanet] Word without galaxy:', word.id, word.word);
  }

  // Determine visual state based on distance
  const visualState = useMemo(() => {
    if (distance < 15) {
      return 'discovered';
    } else if (distance < 30) {
      return 'approaching';
    } else {
      return 'undiscovered';
    }
  }, [distance]);

  // Calculate sphere size based on importance AND distance
  const sphereRadius = useMemo(() => {
    const baseSize = 0.3;
    const importanceBonus = word.importance * 0.5;
    const sizeFromImportance = baseSize + importanceBonus;

    // Scale size based on distance: large when close, smaller when far
    // At distance 0-15: 100% size
    // At distance 15-50: gradually reduce to 40% size
    // At distance 50+: 40% size (minimum)
    let distanceScale = 1.0;
    if (distance > 15) {
      distanceScale = Math.max(0.4, 1.0 - ((distance - 15) / 70)); // Gradual reduction
    }

    return sizeFromImportance * distanceScale;
  }, [word.importance, distance]);

  // Visual properties based on state (high opacity for better visibility at all distances)
  const opacity = visualState === 'undiscovered' ? 0.85 : visualState === 'approaching' ? 0.9 : 1.0;

  // Color based on galaxy membership (unified across all views)
  // Use THREE.Color object to ensure immediate color initialization (prevents black flash)
  const color = useMemo(() => {
    // Ensure we always have a valid galaxy ID
    const galaxyId = word.galaxy || 'void';

    if (isVoidGalaxy(galaxyId)) {
      return new Color(VOID_COLOR_HEX);
    }
    const hexColor = galaxyColorToHex(galaxyId);
    return new Color(hexColor || VOID_COLOR_HEX); // Fallback to void color if undefined
  }, [word.galaxy]);

  // Force color update immediately on mount/color change (prevents black flash)
  useEffect(() => {
    if (meshRef.current && meshRef.current.material) {
      const material = meshRef.current.material as MeshBasicMaterial;
      material.color.copy(color);
      material.needsUpdate = true;
    }
  }, [color]);

  // Show label only when approaching or discovered
  const showLabel = visualState !== 'undiscovered';
  const labelOpacity = visualState === 'approaching'
    ? Math.min(1, (30 - distance) / 15) // Fade in from 30 to 15
    : 1.0;

  return (
    <group position={[word.position.x, word.position.y, word.position.z]}>
      {/* Sphere */}
      <mesh ref={meshRef} userData={{ wordNode: word }}>
        <sphereGeometry args={[sphereRadius, 16, 16]} />
        <meshBasicMaterial
          color={color}
          transparent
          opacity={opacity}
        />
      </mesh>

      {/* Label (text) */}
      {showLabel && (
        <Text
          position={[0, sphereRadius + 1, 0]}
          fontSize={0.8}
          color="white"
          anchorX="center"
          anchorY="middle"
          outlineWidth={0.05}
          outlineColor="#000000"
        >
          <meshBasicMaterial transparent opacity={labelOpacity} />
          {word.word}
        </Text>
      )}
    </group>
  );
};
