import React, { useMemo } from 'react';
import { Text } from '@react-three/drei';
import type { WordNode } from '../../types/game';
import { Vector3 } from 'three';

interface WordPlanetProps {
  word: WordNode;
  playerPosition: Vector3;
  isDiscovered: boolean;
}

export const WordPlanet: React.FC<WordPlanetProps> = ({
  word,
  playerPosition,
  isDiscovered,
}) => {
  // Calculate distance to player
  const distance = useMemo(() => {
    return playerPosition.distanceTo(word.position);
  }, [playerPosition, word.position]);

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

  // Calculate sphere size based on importance
  const sphereRadius = useMemo(() => {
    const baseSize = 0.3;
    const importanceBonus = word.importance * 0.5;
    return baseSize + importanceBonus;
  }, [word.importance]);

  // Visual properties based on state
  const opacity = visualState === 'undiscovered' ? 0.3 : visualState === 'approaching' ? 0.6 : 1.0;
  const color = isDiscovered ? '#4ecdc4' : '#999999';

  // Show label only when approaching or discovered
  const showLabel = visualState !== 'undiscovered';
  const labelOpacity = visualState === 'approaching'
    ? Math.min(1, (30 - distance) / 15) // Fade in from 30 to 15
    : 1.0;

  return (
    <group position={[word.position.x, word.position.y, word.position.z]}>
      {/* Sphere */}
      <mesh>
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
