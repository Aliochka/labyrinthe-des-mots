import { useEffect, useRef, useState } from 'react';
import { Vector3 } from 'three';
import type { WordNode } from '../types/game';

const DISCOVERY_THRESHOLD = 15; // Distance threshold for word discovery
const CHECK_INTERVAL_MS = 100; // Check proximity every 100ms

export interface ProximityResult {
  nearbyWords: string[];
  justDiscovered: string[];
}

export function useProximityDetection(
  playerPosition: Vector3,
  wordNodes: WordNode[],
  discoveredSet: Set<string>,
  threshold: number = DISCOVERY_THRESHOLD
): ProximityResult {
  const [result, setResult] = useState<ProximityResult>({
    nearbyWords: [],
    justDiscovered: [],
  });

  const lastCheckRef = useRef<number>(0);
  const previousDiscoveredRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    const checkProximity = () => {
      const now = Date.now();
      if (now - lastCheckRef.current < CHECK_INTERVAL_MS) {
        return;
      }
      lastCheckRef.current = now;

      const nearby: string[] = [];
      const newlyDiscovered: string[] = [];

      // Check distance to all word nodes
      for (const word of wordNodes) {
        const distance = playerPosition.distanceTo(word.position);

        // Track nearby words (within threshold)
        if (distance <= threshold) {
          nearby.push(word.id);

          // Check if this is a new discovery
          if (!previousDiscoveredRef.current.has(word.id)) {
            newlyDiscovered.push(word.id);
            discoveredSet.add(word.id);
          }
        }
      }

      // Update previous discovered set
      previousDiscoveredRef.current = new Set(discoveredSet);

      // Update result if changed
      if (
        newlyDiscovered.length > 0 ||
        nearby.length !== result.nearbyWords.length
      ) {
        setResult({
          nearbyWords: nearby,
          justDiscovered: newlyDiscovered,
        });
      }
    };

    // Check on every position change
    checkProximity();
  }, [playerPosition, wordNodes, discoveredSet, threshold]);

  return result;
}
