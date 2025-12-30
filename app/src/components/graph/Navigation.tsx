import React, { useState, useEffect, useRef } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { OrbitControls } from '@react-three/drei';
import { Vector3 } from 'three';
import { Player } from '../game/Player';
import { WordPlanet } from '../game/WordPlanet';
import { SimpleSphere } from '../game/SimpleSphere';
import { DistantStars } from '../game/DistantStars';
import { WordLinks } from '../game/WordLinks';
import { useKeyboardControls } from '../../hooks/useKeyboardControls';
import { usePlayerPhysics } from '../../hooks/usePlayerPhysics';
import { useLemmaGraph } from '../../hooks/useLemmaGraph';
import { useNavigationLinks } from '../../hooks/useNavigationLinks';
import { useProximityDetection } from '../../hooks/useProximityDetection';
import { useAppStore } from '../../store/appStore';
import { ControlPanel } from '../ui/ControlPanel';
import { RelationFilter } from '../ui/RelationFilter';

interface NavigationProps {
  width?: number;
  height?: number;
  initialQuery?: string;
}

// LOD (Level of Detail) distances for 3-tier rendering system
const RENDER_DISTANCE_CLOSE = 100;  // Full WordPlanet spheres with labels
const RENDER_DISTANCE_MID = 300;    // SimpleSphere without labels
const RENDER_DISTANCE_FAR = 3000;   // DistantStars points

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
  const [closeWords, setCloseWords] = useState<typeof wordNodes>([]);      // 0-100 units
  const [midWords, setMidWords] = useState<typeof wordNodes>([]);          // 100-300 units
  const [farWords, setFarWords] = useState<typeof wordNodes>([]);          // 300-3000 units
  const lastCullRef = useRef<number>(0);

  // Relation filtering from store
  const enabledRelationTypes = useAppStore((s) => s.enabledRelationTypes);

  // Compute edges for links rendering (500 unit distance for better visibility)
  const navigationEdges = useNavigationLinks(
    wordNodes,
    physics.position,
    500
  );

  // Store for syncing
  const setVisibleNavigationNodeIds = useAppStore((s) => s.setVisibleNavigationNodeIds);

  // Proximity detection (only check close words)
  const { justDiscovered } = useProximityDetection(
    physics.position,
    closeWords,
    discoveredWords
  );

  // Track new discoveries
  useEffect(() => {
    if (justDiscovered.length > 0) {
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
    }
  }, [discoveredWords, setVisibleNavigationNodeIds]);

  // Initialize 3-tier LOD words on first load
  useEffect(() => {
    if (wordNodes.length > 0) {
      const close: typeof wordNodes = [];
      const mid: typeof wordNodes = [];
      const far: typeof wordNodes = [];

      wordNodes.forEach((word) => {
        const distance = randomSpawn.distanceTo(word.position);
        if (distance <= RENDER_DISTANCE_CLOSE) {
          close.push(word);
        } else if (distance <= RENDER_DISTANCE_MID) {
          mid.push(word);
        } else if (distance <= RENDER_DISTANCE_FAR) {
          far.push(word);
        }
        // Beyond RENDER_DISTANCE_FAR: culled (not rendered)
      });

      setCloseWords(close);
      setMidWords(mid);
      setFarWords(far);
    }
  }, [wordNodes, randomSpawn]);

  // Game loop
  useFrame((_state, delta) => {
    // Update player physics with camera direction
    const cameraDirection = new Vector3(0, 0, -1);
    cameraDirection.applyQuaternion(camera.quaternion);
    physics.update(controls, delta, cameraDirection);

    // OrbitControls now handles camera positioning and rotation automatically

    // 3-tier LOD culling (only update every 500ms)
    const now = Date.now();
    if (now - lastCullRef.current > 500) {
      lastCullRef.current = now;
      const close: typeof wordNodes = [];
      const mid: typeof wordNodes = [];
      const far: typeof wordNodes = [];

      wordNodes.forEach((word) => {
        const distance = physics.position.distanceTo(word.position);
        if (distance <= RENDER_DISTANCE_CLOSE) {
          close.push(word);
        } else if (distance <= RENDER_DISTANCE_MID) {
          mid.push(word);
        } else if (distance <= RENDER_DISTANCE_FAR) {
          far.push(word);
        }
        // Beyond RENDER_DISTANCE_FAR: culled
      });

      // Only update if counts changed (avoid unnecessary re-renders)
      if (close.length !== closeWords.length || mid.length !== midWords.length || far.length !== farWords.length) {
        setCloseWords(close);
        setMidWords(mid);
        setFarWords(far);
      }
    }
  });

  if (isLoading) {
    return null;
  }

  return (
    <>
      {/* Better lighting */}
      <ambientLight intensity={0.8} />
      <directionalLight position={[10, 10, 5]} intensity={0.5} />
      <pointLight position={[0, 50, 0]} intensity={0.3} />

      {/* Player */}
      <Player position={physics.position} velocity={physics.velocity} />

      {/* Close Words (0-100 units): Full WordPlanet spheres with labels */}
      {closeWords.map((word) => (
        <WordPlanet
          key={word.id}
          word={word}
          playerPosition={physics.position}
          isDiscovered={discoveredWords.has(word.id)}
        />
      ))}

      {/* Mid-range Words (100-300 units): SimpleSphere without labels */}
      {midWords.length > 0 && (
        <SimpleSphere words={midWords} playerPosition={physics.position} />
      )}

      {/* Far Words (300-3000 units): DistantStars points */}
      {farWords.length > 0 && (
        <DistantStars words={farWords} playerPosition={physics.position} />
      )}

      {/* Word Links (rendered LAST to be in background) */}
      <WordLinks
        edges={navigationEdges}
        nearbyNodes={[...closeWords, ...midWords, ...farWords]}
        galaxyPositions={galaxyPositions}
        showLinks={showLinks}
        enabledRelationTypes={enabledRelationTypes}
      />

      {/* Grid helper (optional, for orientation) */}
      <gridHelper args={[1000, 100, '#444444', '#222222']} position={[0, -5, 0]} />

      {/* OrbitControls - Mouse controls like Map3D */}
      <OrbitControls
        target={physics.position}
        enableDamping={true}
        dampingFactor={0.05}
        minDistance={20}
        maxDistance={200}
        enablePan={true}
        enableRotate={true}
        enableZoom={true}
        mouseButtons={{
          LEFT: 0,   // ROTATE
          MIDDLE: 1, // DOLLY (zoom)
          RIGHT: 2,  // PAN
        }}
      />
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
  const [showLinks, setShowLinks] = useState(true);
  const { nodes: allNodes } = useLemmaGraph();

  // Relation filtering from store
  const enabledRelationTypes = useAppStore((s) => s.enabledRelationTypes);
  const toggleRelationType = useAppStore((s) => s.toggleRelationType);
  const resetRelationFilter = useAppStore((s) => s.resetRelationFilter);

  // Load galaxy positions from universe.json
  useEffect(() => {
    fetch('/universe.json')
      .then(res => res.json())
      .then(data => {
        // Extract galaxy positions with same scaling as WordNode (x10)
        const positions = new Map<string, Vector3>();
        if (data.galaxies && Array.isArray(data.galaxies)) {
          data.galaxies.forEach((galaxy: any) => {
            positions.set(
              galaxy.id,
              new Vector3(galaxy.x * 10, galaxy.y * 10, galaxy.z * 10)
            );
          });
        }

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
          position: [randomSpawn.x, randomSpawn.y + 20, randomSpawn.z + 27],
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
          { keys: 'E', description: 'Monter' },
          { keys: 'Ctrl', description: 'Descendre' },
          { keys: 'Espace', description: 'Arrêter' },
          { keys: 'Shift', description: 'Boost' },
          { keys: 'Clic gauche + glisser', description: 'Rotation caméra' },
          { keys: 'Molette', description: 'Zoom' },
          { keys: 'Clic droit + glisser', description: 'Pan caméra' },
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

        {/* Relation type filters */}
        <RelationFilter
          enabledTypes={enabledRelationTypes}
          onToggle={toggleRelationType}
          onReset={resetRelationFilter}
        />
      </ControlPanel>

    </div>
  );
};
