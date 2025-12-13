import React, { useEffect, useState, useRef } from 'react';
import ForceGraph3D from 'react-force-graph-3d';
import * as THREE from 'three';
import { lemmaDataService } from '../../services/LemmaDataService';
import type { LemmaNode } from '../../types/lemma';
import { useAppStore } from '../../store/appStore';

// Position scale for the atlas
const POSITION_SCALE = 5;

interface GraphExplorationProps {
  width?: number;
  height?: number;
  initialQuery?: string;
  onLemmaClick?: (lemma: LemmaNode) => void;
}

interface GraphNode {
  id: string;
  name: string;
  senseCount: number;
  synsets: LemmaNode['synsets'];
  size?: number;
  color?: string;
  isCenter?: boolean;
  isSelected?: boolean;
  relationCount: number;
  x: number;
  y: number;
  z: number;
}

interface GraphLink {
  source: string;
  target: string;
  weight?: number;
}

interface GraphData {
  nodes: GraphNode[];
  links: GraphLink[];
}

export const GraphExploration: React.FC<GraphExplorationProps> = ({
  width = 800,
  height = 600,
  initialQuery = 'vie',
  onLemmaClick
}) => {
  // Lecture du mode et des mots découverts depuis le store
  const mode = useAppStore((s) => s.mode);
  const visibleNavigationNodeIds = useAppStore((s) => s.visibleNavigationNodeIds);

  const [graphData, setGraphData] = useState<GraphData>({ nodes: [], links: [] });
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);

  const forceGraphRef = useRef<any>(null);
  const hasInitialCameraRef = useRef(false);

  console.log('[GraphExploration] Mode:', mode, 'Mots découverts:', visibleNavigationNodeIds.length);

  // Keyboard handler: expand from selected lemma on Space (study mode only)
  useEffect(() => {
    // Disable manual expansion in play mode
    if (mode === 'play') return;

    const handleKeyPress = (event: KeyboardEvent) => {
      if (event.key === ' ' && selectedNodeId) {
        event.preventDefault();
        expandFromLemma(selectedNodeId);
      }
    };

    window.addEventListener('keydown', handleKeyPress);
    return () => window.removeEventListener('keydown', handleKeyPress);
  }, [selectedNodeId, mode]);

  const expandFromLemma = (lemmaName: string) => {
    console.log('Expansion depuis le lemme :', lemmaName);

    const expansion = lemmaDataService.expandLemma(lemmaName, 50, 2);
    console.log(
      'Expansion depuis:',
      lemmaName,
      'neighbors:',
      expansion?.neighbors?.length || 0
    );
    if (!expansion) return;

    setGraphData(prevData => {
      const currentNodes = [...prevData.nodes];
      const currentLinks = [...prevData.links];

      // 1) Add all unique neighbor nodes
      expansion.neighbors.forEach(neighbor => {
        if (!currentNodes.find(n => n.id === neighbor.lemma)) {
          currentNodes.push(createGraphNode(neighbor, false));
        }
      });

      // 2) Add missing nodes referenced by relations
      expansion.relations.forEach(rel => {
        // SOURCE
        if (!currentNodes.find(n => n.id === rel.source)) {
          const node = lemmaDataService.getLemmaByName(rel.source);
          if (node) {
            currentNodes.push(createGraphNode(node, false));
          }
        }

        // TARGET
        if (!currentNodes.find(n => n.id === rel.target)) {
          const node = lemmaDataService.getLemmaByName(rel.target);
          if (node) {
            currentNodes.push(createGraphNode(node, false));
          }
        }
      });

      // 3) Add relations
      expansion.relations.forEach(rel => {
        if (
          !currentLinks.find(
            l => l.source === rel.source && l.target === rel.target
          )
        ) {
          currentLinks.push({
            source: rel.source,
            target: rel.target,
            weight: rel.weight
          });
        }
      });

      return {
        nodes: currentNodes,
        links: currentLinks
      };
    });
  };

  // Configure controls
  useEffect(() => {
    if (!forceGraphRef.current) return;

    const fg = forceGraphRef.current;
    const controls: any = fg.controls?.() ?? fg.controls;

    if (controls) {
      controls.enableDamping = true;
      controls.dampingFactor = 0.1;
      controls.rotateSpeed = 0.4;
      controls.zoomSpeed = 0.6;
      controls.panSpeed = 0.8;

      controls.minDistance = 10;
      controls.maxDistance = 600;

      if (controls.listenToKeyEvents) {
        controls.listenToKeyEvents(window);
      }
      controls.keyPanSpeed = 40;
    }
  }, []);

  // Initial graph loading - adaptatif selon le mode
  useEffect(() => {
    const loadData = async () => {
      try {
        console.log('[GraphExploration] Initialisation en mode:', mode);

        await lemmaDataService.initialize();

        const searchResults = lemmaDataService.searchLemmas({
          query: initialQuery,
          limit: 1
        });

        if (searchResults.length === 0) {
          throw new Error(`Aucun lemme trouvé pour "${initialQuery}"`);
        }

        const centerLemma = searchResults[0];
        console.log('[GraphExploration] Lemme centre:', centerLemma.lemma);

        const nodes: GraphNode[] = [];
        const links: GraphLink[] = [];

        // Mode Study: BFS expansion complète
        if (mode === 'study') {
          console.log('[GraphExploration] Mode STUDY: expansion BFS');

          // Add center node
          nodes.push(createGraphNode(centerLemma, true));

          // Expand via BFS
          const expansion = lemmaDataService.expandLemma(centerLemma.lemma, 150, 2);

          if (expansion) {
            // Add neighbors
            expansion.neighbors.forEach(neighbor => {
              if (!nodes.find(n => n.id === neighbor.lemma)) {
                nodes.push(createGraphNode(neighbor, false));
              }
            });

            // Add missing nodes from relations
            expansion.relations.forEach(rel => {
              if (!nodes.find(n => n.id === rel.source)) {
                const node = lemmaDataService.getLemmaByName(rel.source);
                if (node) nodes.push(createGraphNode(node, false));
              }
              if (!nodes.find(n => n.id === rel.target)) {
                const node = lemmaDataService.getLemmaByName(rel.target);
                if (node) nodes.push(createGraphNode(node, false));
              }
            });

            // Add relations
            expansion.relations.forEach(rel => {
              if (!links.find(l => l.source === rel.source && l.target === rel.target)) {
                links.push({
                  source: rel.source,
                  target: rel.target,
                  weight: rel.weight
                });
              }
            });
          }
        }
        // Mode Play: seulement le mot initial au départ
        else {
          console.log('[GraphExploration] Mode PLAY: mot initial seulement');
          nodes.push(createGraphNode(centerLemma, true));

          // Charger les liens si des mots ont déjà été découverts
          if (visibleNavigationNodeIds.length > 0) {
            console.log('[GraphExploration] Chargement des mots déjà découverts:', visibleNavigationNodeIds.length);

            for (const nodeId of visibleNavigationNodeIds) {
              const lemma = lemmaDataService.getLemmaByName(nodeId);
              if (lemma && !nodes.find(n => n.id === nodeId)) {
                nodes.push(createGraphNode(lemma, false));
              }
            }

            // Charger les liens entre les nœuds découverts
            const nodeIdSet = new Set(nodes.map(n => n.id));
            for (const nodeId of nodeIdSet) {
              const edges = lemmaDataService.getLemmaEdges(nodeId);
              edges.forEach(edge => {
                const targetInGraph = nodeIdSet.has(edge.target);
                if (targetInGraph && !links.find(l => l.source === edge.source && l.target === edge.target)) {
                  links.push({
                    source: edge.source,
                    target: edge.target,
                    weight: edge.weight
                  });
                }
              });
            }
          }
        }

        console.log(`[GraphExploration] Graphe créé: ${nodes.length} nœuds, ${links.length} liens`);
        setGraphData({ nodes, links });
        setIsLoading(false);

      } catch (err: any) {
        console.error('[GraphExploration] Erreur chargement:', err);
        setError(err.message ?? 'Erreur inconnue');
        setIsLoading(false);
      }
    };

    loadData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, initialQuery]);

  // Dynamic update when new words are discovered in Navigation (play mode only)
  useEffect(() => {
    if (mode !== 'play') return;
    if (visibleNavigationNodeIds.length === 0) return;

    console.log('[GraphExploration] Mise à jour dynamique:', visibleNavigationNodeIds.length, 'mots découverts');

    setGraphData(prevData => {
      const currentNodeIds = new Set(prevData.nodes.map(n => n.id));
      const newNodes = [...prevData.nodes];
      const newLinks = [...prevData.links];

      // Add newly discovered nodes
      for (const nodeId of visibleNavigationNodeIds) {
        if (!currentNodeIds.has(nodeId)) {
          const lemma = lemmaDataService.getLemmaByName(nodeId);
          if (lemma) {
            newNodes.push(createGraphNode(lemma, false));
            currentNodeIds.add(nodeId);
          }
        }
      }

      // Add links between visible nodes
      for (const nodeId of currentNodeIds) {
        const edges = lemmaDataService.getLemmaEdges(nodeId);
        edges.forEach(edge => {
          const targetInGraph = currentNodeIds.has(edge.target);
          const linkExists = newLinks.find(l => l.source === edge.source && l.target === edge.target);
          if (targetInGraph && !linkExists) {
            newLinks.push({
              source: edge.source,
              target: edge.target,
              weight: edge.weight
            });
          }
        });
      }

      console.log(`[GraphExploration] Graphe mis à jour: ${newNodes.length} nœuds (+${newNodes.length - prevData.nodes.length}), ${newLinks.length} liens (+${newLinks.length - prevData.links.length})`);

      return { nodes: newNodes, links: newLinks };
    });
  }, [mode, visibleNavigationNodeIds]);

  // Helper functions
  const createGraphNode = (lemma: LemmaNode, isCenter: boolean): GraphNode => {
    return {
      id: lemma.lemma,
      name: lemma.lemma,
      senseCount: lemma.senseCount,
      synsets: lemma.synsets,
      size: calculateNodeSize(lemma, isCenter),
      color: isCenter ? '#ff6b6b' : '#4ecdc4',
      isCenter,
      isSelected: false,
      relationCount: lemma.relationCount,
      x: lemma.x * POSITION_SCALE,
      y: lemma.y * POSITION_SCALE,
      z: lemma.z * POSITION_SCALE
    };
  };

  const calculateNodeSize = (lemma: LemmaNode, isCenter: boolean): number => {
    const baseSize = isCenter ? 14 : 10;
    const senseBonus = Math.log2(lemma.senseCount + 1) * 1.2;
    return baseSize + senseBonus;
  };

  // Click handler: selection only
  const handleNodeClick = (node: any) => {
    console.log('Clic sur lemme:', node.id);
    setSelectedNodeId(node.id);

    setGraphData(prevData => {
      const next: GraphData = {
        ...prevData,
        nodes: prevData.nodes
      };

      next.nodes.forEach(n => {
        (n as any).isSelected = n.id === node.id;
      });

      return next;
    });

    if (onLemmaClick) {
      const lemmaNode: LemmaNode = {
        lemma: node.id,
        synsets: node.synsets,
        x: node.x,
        y: node.y,
        z: node.z,
        senseCount: node.senseCount,
        relationCount: node.relationCount
      };
      onLemmaClick(lemmaNode);
    }
  };

  // Rendering

  if (isLoading) {
    return (
      <div
        style={{
          width,
          height,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: '#111',
          color: '#f5f5f5'
        }}
      >
        <div>Chargement du graphe...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div
        style={{
          width,
          height,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: '#111',
          color: '#f5f5f5'
        }}
      >
        <div>Erreur: {error}</div>
      </div>
    );
  }

  return (
    <div style={{ position: 'relative', width, height }}>
      {/* Mode indicator and stats */}
      <div
        style={{
          position: 'absolute',
          top: 10,
          left: 10,
          background: 'rgba(0, 0, 0, 0.7)',
          color: '#f5f5f5',
          padding: '8px 12px',
          borderRadius: '6px',
          fontSize: '13px',
          fontFamily: 'monospace',
          zIndex: 1000,
          pointerEvents: 'none'
        }}
      >
        {mode === 'play' ? (
          <div>
            <div style={{ color: '#4ecdc4', fontWeight: 'bold' }}>MODE: PLAY</div>
            <div>Découverts: {graphData.nodes.length} mots</div>
            <div>Liens: {graphData.links.length}</div>
            {graphData.nodes.length === 1 && (
              <div style={{ marginTop: 4, color: '#ffaa00' }}>
                → Naviguez pour découvrir des mots !
              </div>
            )}
          </div>
        ) : (
          <div>
            <div style={{ color: '#ff6b6b', fontWeight: 'bold' }}>MODE: STUDY</div>
            <div>Exploration: {graphData.nodes.length} nœuds</div>
            <div>Liens: {graphData.links.length}</div>
            {selectedNodeId && (
              <div style={{ marginTop: 4, color: '#ffaa00' }}>
                → Appuyez sur ESPACE pour étendre
              </div>
            )}
          </div>
        )}
      </div>

      <ForceGraph3D
        ref={forceGraphRef}
        width={width}
        height={height}
        graphData={graphData}
        backgroundColor="#111"
        controlType="orbit"
      nodeThreeObject={(node: any) => {
        const isSelected = node.isSelected;
        const isCenter = node.isCenter;
        const relationCount = node.relationCount || 0;
        const importance = Math.min(relationCount / 10, 1);

        const sprite = new THREE.Sprite();

        // 1) Font size
        let fontSize = 120;
        if (isSelected) fontSize = 200;
        else if (isCenter) fontSize = 170;
        else if (importance > 0.5) fontSize = 150;
        else if (importance > 0.2) fontSize = 135;
        else fontSize = 120;

        // 2) Color
        let color = '#f0f0f0';
        if (isSelected) color = '#ffff00';
        else if (isCenter) color = '#ff6b6b';
        else if (importance > 0.5) color = '#ffffff';
        else if (importance > 0.2) color = '#cccccc';
        else color = '#999999';

        const text = node.name || node.id;

        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d')!;

        ctx.font = `bold ${fontSize}px Arial`;
        const textWidth = ctx.measureText(text).width;

        canvas.width = textWidth + 150;
        canvas.height = fontSize * 2;

        ctx.font = `bold ${fontSize}px Arial`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillStyle = color;

        ctx.shadowColor = isSelected ? '#ffff00' : 'rgba(0, 0, 0, 0.3)';
        ctx.shadowBlur = isSelected ? 8 : 2;
        ctx.shadowOffsetX = isSelected ? 0 : 1;
        ctx.shadowOffsetY = isSelected ? 0 : 1;

        ctx.fillText(text, canvas.width / 2, canvas.height / 2);

        const texture = new THREE.CanvasTexture(canvas);
        texture.minFilter = THREE.LinearFilter;
        texture.magFilter = THREE.LinearFilter;

        sprite.material = new THREE.SpriteMaterial({
          map: texture,
          transparent: true,
          depthTest: false,
          alphaTest: 0.1
        });

        // 5) 3D scale
        let scale = 40;
        if (isSelected) scale = 60;
        else if (isCenter) scale = 50;
        else if (importance > 0.5) scale = 45;
        else if (importance > 0.2) scale = 42;
        else scale = 38;

        sprite.scale.set(scale, scale * 0.3, 1);

        return sprite;
      }}
      nodeLabel=""
      onNodeClick={handleNodeClick}
      linkWidth={1.2}
      linkColor={() => '#cccccc'}
      linkOpacity={0.6}
      linkDirectionalParticles={0}
      linkVisibility={true}
      showNavInfo={false}
      onEngineStop={() => {
        const fg = forceGraphRef.current;
        if (!fg) return;

        if (hasInitialCameraRef.current) return;
        hasInitialCameraRef.current = true;

        const dist = 350;
        const pos = { x: 0, y: 0, z: dist };

        fg.cameraPosition(pos, { x: 0, y: 0, z: 0 }, 2000);
      }}
    />
    </div>
  );
};
