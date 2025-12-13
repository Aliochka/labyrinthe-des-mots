// src/pages/GamePage.tsx
import React, { useEffect, useState } from 'react';
import { useAppStore } from '../store/appStore';
import { Navigation } from '../components/graph/Navigation';
import Map3D from '../components/graph/Map3D';
import Map2D from '../components/graph/Map2D';
import { useMultiScaleGraph } from '../hooks/useMultiScaleGraph';
import { Params } from '../components/ui/Params';

type ViewMode = 'navigation' | 'map2d' | 'map3d';

const randomWords = [
  'entité', 'chat', 'animal', 'maison', 'vie', 'temps',
  'eau', 'feu', 'terre', 'air', 'joie', 'tristesse',
  'amour', 'paix', 'liberté',
];

export const GamePage: React.FC = () => {
  const [viewMode, setViewMode] = useState<ViewMode>('navigation');
  const [currentQuery] = useState(() =>
    randomWords[Math.floor(Math.random() * randomWords.length)]
  );

  const mode = useAppStore((s) => s.mode);
  const setMode = useAppStore((s) => s.setMode);
  const toggleSettings = useAppStore((s) => s.toggleSettings);

  // Assurer que le mode est bien "play" sur cette page
  useEffect(() => {
    if (mode !== 'play') {
      setMode('play');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode]);

  // 🔑 On active le chargement du graphe uniquement quand on n’est pas en vue navigation
  const shouldLoadGraph = viewMode !== 'navigation';
  const { graph: multiScaleGraph, isLoading: isLoadingGraph } =
    useMultiScaleGraph(shouldLoadGraph);

  return (
    <div
      style={{
        width: '100%',
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        background: '#111',
        color: '#f5f5f5',
      }}
    >
      {/* Barre d'onglets */}
      <div
        style={{
          height: 48,
          display: 'flex',
          alignItems: 'center',
          gap: 4,
          padding: '0 16px',
          borderBottom: '1px solid rgba(255, 255, 255, 0.1)',
          background: 'rgba(0, 0, 0, 0.85)',
          backdropFilter: 'blur(8px)',
        }}
      >
        <button
          onClick={() => setViewMode('navigation')}
          style={{
            padding: '6px 12px',
            fontSize: 13,
            border: 'none',
            borderRadius: 6,
            background:
              viewMode === 'navigation'
                ? 'rgba(78, 205, 196, 0.15)'
                : 'transparent',
            color:
              viewMode === 'navigation' ? '#4ecdc4' : '#f5f5f5',
            cursor: 'pointer',
          }}
        >
          Navigation
        </button>
        <button
          onClick={() => setViewMode('map2d')}
          style={{
            padding: '6px 12px',
            fontSize: 13,
            border: 'none',
            borderRadius: 6,
            background:
              viewMode === 'map2d'
                ? 'rgba(78, 205, 196, 0.15)'
                : 'transparent',
            color: viewMode === 'map2d' ? '#4ecdc4' : '#f5f5f5',
            cursor: 'pointer',
          }}
        >
          Map 2D
        </button>
        <button
          onClick={() => setViewMode('map3d')}
          style={{
            padding: '6px 12px',
            fontSize: 13,
            border: 'none',
            borderRadius: 6,
            background:
              viewMode === 'map3d'
                ? 'rgba(78, 205, 196, 0.15)'
                : 'transparent',
            color: viewMode === 'map3d' ? '#4ecdc4' : '#f5f5f5',
            cursor: 'pointer',
          }}
        >
          Map 3D
        </button>

        {/* Séparateur */}
        <div style={{ flex: 1 }} />

        {/* Bouton paramètres */}
        <button
          onClick={toggleSettings}
          style={{
            padding: '6px 12px',
            fontSize: 13,
            border: 'none',
            borderRadius: 6,
            background: 'transparent',
            color: '#f5f5f5',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: 6,
          }}
          title="Paramètres"
        >
          ⚙️ Paramètres
        </button>
      </div>

      {/* Contenu */}
      <div style={{ flex: 1, minHeight: 0, position: 'relative' }}>
        {viewMode === 'navigation' && (
          <Navigation
            width={window.innerWidth}
            height={window.innerHeight - 48}
            initialQuery={currentQuery}
          />
        )}

        {viewMode === 'map2d' &&
          (isLoadingGraph || !multiScaleGraph ? (
            <div
              style={{
                width: '100%',
                height: '100%',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              Chargement de la carte 2D...
            </div>
          ) : (
            <Map2D
              graph={multiScaleGraph}
              width={window.innerWidth}
              height={window.innerHeight - 48}
            />
          ))}

        {viewMode === 'map3d' &&
          (isLoadingGraph || !multiScaleGraph ? (
            <div
              style={{
                width: '100%',
                height: '100%',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              Chargement de la carte 3D...
            </div>
          ) : (
            <Map3D
              graph={multiScaleGraph}
              width={window.innerWidth}
              height={window.innerHeight - 48}
            />
          ))}
      </div>

      {/* Params Panel */}
      <Params />
    </div>
  );
};
