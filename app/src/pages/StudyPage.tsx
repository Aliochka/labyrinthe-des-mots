// src/pages/StudyPage.tsx
import React, { useEffect, useState } from 'react';
import { useAppStore } from '../store/appStore';
import { GraphExploration } from '../components/graph/GraphExploration';
import Map2D from '../components/graph/Map2D';
import Map3D from '../components/graph/Map3D';
import { useMultiScaleGraph } from '../hooks/useMultiScaleGraph';
import { PageLayout, type Tab } from '../components/ui/PageLayout';

const randomWords = [
  'entité', 'chat', 'animal', 'maison', 'vie', 'temps',
  'eau', 'feu', 'terre', 'air', 'joie', 'tristesse',
  'amour', 'paix', 'liberté',
];

export const StudyPage: React.FC = () => {
  const [activeTabId, setActiveTabId] = useState('graph');
  const [currentQuery] = useState(() =>
    randomWords[Math.floor(Math.random() * randomWords.length)]
  );

  const mode = useAppStore((s) => s.mode);
  const setMode = useAppStore((s) => s.setMode);

  // Assurer que le mode est bien "study" sur cette page
  useEffect(() => {
    if (mode !== 'study') {
      setMode('study');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode]);

  // Charger le graphe multiscale (seulement pour Map2D et Map3D)
  const shouldLoadGraph = activeTabId === 'map2d' || activeTabId === 'map3d';
  const { graph: multiScaleGraph, isLoading: isLoadingGraph } =
    useMultiScaleGraph(shouldLoadGraph);

  const tabs: Tab[] = [
    {
      id: 'graph',
      label: 'Exploration du graphe',
      content: (
        <GraphExploration
          width={window.innerWidth}
          height={window.innerHeight - 48}
          initialQuery={currentQuery}
        />
      ),
    },
    {
      id: 'map2d',
      label: 'Map 2D',
      content:
        isLoadingGraph || !multiScaleGraph ? (
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
        ),
    },
    {
      id: 'map3d',
      label: 'Map 3D',
      content:
        isLoadingGraph || !multiScaleGraph ? (
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
        ),
    },
  ];

  return (
    <PageLayout
      tabs={tabs}
      activeTabId={activeTabId}
      setActiveTabId={setActiveTabId}
      modeSwitchLink={{
        to: '/game',
        label: '🎮 Mode Jeu',
        color: '#4ecdc4',
      }}
    />
  );
};
