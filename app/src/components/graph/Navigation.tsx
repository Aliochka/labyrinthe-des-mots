import React, { useState, useEffect, useRef } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { Vector3 } from 'three';
import { Player } from '../game/Player';
import { WordPlanet } from '../game/WordPlanet';
import { DistantStars } from '../game/DistantStars';
import { WordLinks } from '../game/WordLinks';
import { useKeyboardControls } from '../../hooks/useKeyboardControls';
import { usePlayerPhysics } from '../../hooks/usePlayerPhysics';
import { useLemmaGraph } from '../../hooks/useLemmaGraph';
import { useNavigationLinks } from '../../hooks/useNavigationLinks';
import { useProximityDetection } from '../../hooks/useProximityDetection';
import { useAppStore } from '../../store/appStore';
import { ControlPanel } from '../ui/ControlPanel';
import { galaxyDataService } from '../../services/GalaxyDataService';

interface NavigationProps {
  width?: number;
  height?: number;
  initialQuery?: string;
}

// Render distance for word planets (only show nearby planets)
const RENDER_DISTANCE = 50;
// Distance for distant stars (show as points beyond RENDER_DISTANCE)
const STAR_DISTANCE = 500;

// Game scene component (inside Canvas)
const GameScene: React.FC<{
  randomSpawn: Vector3;
  galaxyPositions: Map<string, Vector3>;
  showLinks: boolean;
}> = ({ randomSpawn, galaxyPositions, showLinks }) => {
  const { camera } = useThree();
  const controls = useKeyboardControls();
  const physics = usePlayerPhysics(randomSpawn);
  const { nodes: wordNodes, isLoading } = useLemmaGraph();
  const [discoveredWords, setDiscoveredWords] = useState<Set<string>>(new Set());
  const [nearbyWords, setNearbyWords] = useState<typeof wordNodes>([]);
  const [distantWords, setDistantWords] = useState<typeof wordNodes>([]);
  const lastCullRef = useRef<number>(0);

  // Compute edges for links rendering
  const navigationEdges = useNavigationLinks(
    wordNodes,
    physics.position,
    RENDER_DISTANCE
  );

  // Store for syncing
  const setVisibleNavigationNodeIds = useAppStore((s) => s.setVisibleNavigationNodeIds);

  // Proximity detection (only check nearby words)
  const { justDiscovered } = useProximityDetection(
    physics.position,
    nearbyWords,
    discoveredWords
  );

  // Track new discoveries
  useEffect(() => {
    if (justDiscovered.length > 0) {
      console.log(`[Navigation] Discovered ${justDiscovered.length} new words:`, justDiscovered);
      setDiscoveredWords((prev) => {
        const next = new Set(prev);
        justDiscovered.forEach((word) => next.add(word));
        return next;
      });
    }
  }, [justDiscovered]);

  // Sync discovered words with store
  useEffect(() => {
    const discoveredArray = Array.from(discoveredWords);
    if (discoveredArray.length > 0) {
      setVisibleNavigationNodeIds(discoveredArray);
      console.log(`[Navigation] Synced ${discoveredArray.length} discovered words to store`);
    }
  }, [discoveredWords, setVisibleNavigationNodeIds]);

  // Initialize nearby and distant words on first load
  useEffect(() => {
    if (wordNodes.length > 0) {
      const nearby: typeof wordNodes = [];
      const distant: typeof wordNodes = [];

      wordNodes.forEach((word) => {
        const distance = randomSpawn.distanceTo(word.position);
        if (distance <= RENDER_DISTANCE) {
          nearby.push(word);
        } else if (distance <= STAR_DISTANCE) {
          distant.push(word);
        }
      });

      setNearbyWords(nearby);
      setDistantWords(distant);
      console.log(`[Navigation] Initial render: ${nearby.length} nearby words, ${distant.length} distant stars`);
    }
  }, [wordNodes, randomSpawn]);

  // Game loop
  useFrame((_state, delta) => {
    // Update player physics
    const cameraDirection = new Vector3(0, 0, -1);
    cameraDirection.applyQuaternion(camera.quaternion);
    physics.update(controls, delta, cameraDirection);

    // Update third-person camera
    const cameraOffset = new Vector3(0, 15, 20); // Behind and above
    const targetCameraPos = physics.position.clone().add(cameraOffset);
    camera.position.lerp(targetCameraPos, 0.1);

    // Look at player
    const lookAtTarget = physics.position.clone().add(new Vector3(0, 2, 0));
    camera.lookAt(lookAtTarget);

    // Cull distant word planets (only update every 500ms)
    const now = Date.now();
    if (now - lastCullRef.current > 500) {
      lastCullRef.current = now;
      const nearby: typeof wordNodes = [];
      const distant: typeof wordNodes = [];

      wordNodes.forEach((word) => {
        const distance = physics.position.distanceTo(word.position);
        if (distance <= RENDER_DISTANCE) {
          nearby.push(word);
        } else if (distance <= STAR_DISTANCE) {
          distant.push(word);
        }
      });

      if (nearby.length !== nearbyWords.length || distant.length !== distantWords.length) {
        setNearbyWords(nearby);
        setDistantWords(distant);
        console.log(`[Navigation] Updated: ${nearby.length} nearby words, ${distant.length} distant stars`);
      }
    }
  });

  if (isLoading) {
    return null;
  }

  // Log rendering info
  console.log(`[GameScene] Rendering ${nearbyWords.length} nearby words, ${distantWords.length} distant stars, ${discoveredWords.size} discovered`);

  return (
    <>
      {/* Better lighting */}
      <ambientLight intensity={0.8} />
      <directionalLight position={[10, 10, 5]} intensity={0.5} />
      <pointLight position={[0, 50, 0]} intensity={0.3} />

      {/* Word Links (semantic/etymology/tethers) */}
      <WordLinks
        edges={navigationEdges}
        nearbyNodes={nearbyWords}
        galaxyPositions={galaxyPositions}
        showLinks={showLinks}
      />

      {/* Player */}
      <Player position={physics.position} velocity={physics.velocity} />

      {/* Word Planets (only nearby ones) */}
      {nearbyWords.length > 0 ? (
        nearbyWords.map((word) => (
          <WordPlanet
            key={word.id}
            word={word}
            playerPosition={physics.position}
            isDiscovered={discoveredWords.has(word.id)}
          />
        ))
      ) : (
        <mesh position={[0, 0, 0]}>
          <sphereGeometry args={[5, 32, 32]} />
          <meshBasicMaterial color="red" />
        </mesh>
      )}

      {/* Distant Stars (words far away as luminous points) */}
      {distantWords.length > 0 && (
        <DistantStars words={distantWords} playerPosition={physics.position} />
      )}

      {/* Grid helper (optional, for orientation) */}
      <gridHelper args={[1000, 100, '#444444', '#222222']} position={[0, -5, 0]} />
    </>
  );
};

export const Navigation: React.FC<NavigationProps> = ({
  width = window.innerWidth,
  height = window.innerHeight - 96,
  initialQuery: _initialQuery,
}) => {
  const [randomSpawn, setRandomSpawn] = useState<Vector3 | null>(null);
  const [galaxyPositions, setGalaxyPositions] = useState<Map<string, Vector3>>(new Map());
  const [showLinks, setShowLinks] = useState(false);
  const { nodes: allNodes } = useLemmaGraph();

  // Load galaxy positions from universe.json
  useEffect(() => {
    fetch('/universe.json')
      .then(res => res.json())
      .then(data => {
        console.log('[Navigation] Loading universe.json for galaxy positions...');

        // Initialize GalaxyDataService
        galaxyDataService.initialize({
          galaxies: data.galaxies,
          stars: data.stars,
          bundles: data.bundles,
          galaxyMembersMap: new Map(),
          starIndex: new Map(),
        });

        // Extract galaxy positions with same scaling as WordNode (x5)
        const positions = new Map<string, Vector3>();
        if (data.galaxies && data.galaxies.nodes) {
          data.galaxies.nodes.forEach((galaxy: any) => {
            positions.set(
              galaxy.id,
              new Vector3(galaxy.x * 5, galaxy.y * 5, galaxy.z * 5)
            );
          });
        }

        console.log(`[Navigation] Loaded ${positions.size} galaxy positions`);
        setGalaxyPositions(positions);
      })
      .catch(error => {
        console.error('[Navigation] Failed to load universe.json:', error);
      });
  }, []);

  // Generate random spawn position near a random word
  useEffect(() => {
    if (allNodes.length > 0 && !randomSpawn) {
      // Pick a random word
      const randomWord = allNodes[Math.floor(Math.random() * allNodes.length)];
      // Spawn very close (5-15 units away)
      const offset = 5 + Math.random() * 10;
      const angle = Math.random() * Math.PI * 2;
      const spawnPos = randomWord.position.clone().add(
        new Vector3(
          Math.cos(angle) * offset,
          Math.random() * 5, // Small vertical offset
          Math.sin(angle) * offset
        )
      );
      setRandomSpawn(spawnPos);
      console.log(`[Navigation] Spawning near word "${randomWord.word}" at position (${spawnPos.x.toFixed(1)}, ${spawnPos.y.toFixed(1)}, ${spawnPos.z.toFixed(1)}), distance ${offset.toFixed(1)}`);
      console.log(`[Navigation] Word position: (${randomWord.position.x.toFixed(1)}, ${randomWord.position.y.toFixed(1)}, ${randomWord.position.z.toFixed(1)})`);
    }
  }, [allNodes, randomSpawn]);

  if (!randomSpawn) {
    return (
      <div style={{ width, height, background: '#111', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'white' }}>
        Initialisation...
      </div>
    );
  }

  return (
    <div style={{ width, height, position: 'relative', background: '#111' }}>
      <Canvas
        camera={{
          position: [randomSpawn.x, randomSpawn.y + 15, randomSpawn.z + 20],
          fov: 60,
        }}
      >
        <GameScene
          randomSpawn={randomSpawn}
          galaxyPositions={galaxyPositions}
          showLinks={showLinks}
        />
      </Canvas>

      {/* Control Panel */}
      <ControlPanel
        title="Navigation 3D"
        position="top-left"
        controls={[
          { keys: 'WASD / ↑↓←→', description: 'Déplacer' },
          { keys: 'Espace', description: 'Monter' },
          { keys: 'Ctrl', description: 'Descendre' },
          { keys: 'Shift', description: 'Boost' },
          { keys: 'Souris', description: 'Regarder' },
        ]}
      >
        {/* Toggle for word links */}
        <div style={{
          marginTop: 12,
          paddingTop: 12,
          borderTop: '1px solid rgba(255, 255, 255, 0.1)'
        }}>
          <label style={{
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            cursor: 'pointer',
            color: '#f5f5f5',
            fontSize: 11,
          }}>
            <input
              type="checkbox"
              checked={showLinks}
              onChange={(e) => setShowLinks(e.target.checked)}
              style={{ cursor: 'pointer' }}
            />
            <span>Afficher les liens</span>
          </label>
        </div>
      </ControlPanel>

    </div>
  );
};
