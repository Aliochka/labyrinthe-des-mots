// src/pages/GamePage.tsx
import React, { useState } from 'react';
import { Navigation } from '../components/graph/Navigation';
import { GraphExploration } from '../components/graph/GraphExploration';
import Map2D from '../components/graph/Map2D';
import Map3D from '../components/graph/Map3D';
import { useUniverseGraph } from '../hooks/useUniverseGraph';
import { PageLayout, type Tab } from '../components/ui/PageLayout';

const randomWords = [
  'entité', 'chat', 'animal', 'maison', 'vie', 'temps',
  'eau', 'feu', 'terre', 'air', 'joie', 'tristesse',
  'amour', 'paix', 'liberté',
];

export const GamePage: React.FC = () => {
  const [activeTabId, setActiveTabId] = useState('navigation');
  const [currentQuery] = useState(() =>
    randomWords[Math.floor(Math.random() * randomWords.length)]
  );

  // Charger le graphe universe (seulement pour Map2D et Map3D)
  const shouldLoadGraph = activeTabId === 'map2d' || activeTabId === 'map3d';
  const { graphData, isLoading: isLoadingGraph } =
    useUniverseGraph(shouldLoadGraph);

  // Fonction pour générer le contenu du tab actif UNIQUEMENT
  const getActiveContent = () => {
    if (activeTabId === 'navigation') {
      return (
        <Navigation
          width={window.innerWidth}
          height={window.innerHeight - 48}
          initialQuery={currentQuery}
        />
      );
    }

    if (activeTabId === 'map2d') {
      if (isLoadingGraph || !graphData) {
        return (
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
        );
      }
      return (
        <Map2D
          graphData={graphData}
          width={window.innerWidth}
          height={window.innerHeight - 48}
        />
      );
    }

    if (activeTabId === 'map3d') {
      if (isLoadingGraph || !graphData) {
        return (
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
        );
      }
      return (
        <Map3D
          graphData={graphData}
          width={window.innerWidth}
          height={window.innerHeight - 48}
        />
      );
    }

    if (activeTabId === 'graph') {
      return (
        <GraphExploration
          width={window.innerWidth}
          height={window.innerHeight - 48}
          initialQuery={currentQuery}
        />
      );
    }

    return null;
  };

  const tabs: Tab[] = [
    { id: 'navigation', label: 'Navigation', content: null },
    { id: 'map2d', label: 'Map 2D', content: null },
    { id: 'map3d', label: 'Map 3D', content: null },
    { id: 'graph', label: 'Exploration du graphe', content: null },
  ];

  return (
    <PageLayout
      tabs={tabs}
      activeTabId={activeTabId}
      setActiveTabId={setActiveTabId}
      activeContent={getActiveContent()}
    />
  );
};
