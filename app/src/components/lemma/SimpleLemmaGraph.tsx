import React, { useEffect, useState, useRef } from 'react';
import ForceGraph3D from 'react-force-graph-3d';
import * as THREE from 'three';
import { lemmaDataService } from '../../services/LemmaDataService';
import type { LemmaNode } from '../../types/lemma';

// On garde une échelle modeste, l'atlas sert juste de position initiale
const POSITION_SCALE = 5;

interface SimpleLemmaGraphProps {
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

export const SimpleLemmaGraph: React.FC<SimpleLemmaGraphProps> = ({
  width = 800,
  height = 600,
  initialQuery = 'vie',
  onLemmaClick
}) => {
  const [graphData, setGraphData] = useState<GraphData>({ nodes: [], links: [] });
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);

  const forceGraphRef = useRef<any>(null);
  const hasInitialCameraRef = useRef(false);

  // --- clavier : espace pour étendre depuis le lemme sélectionné ---
  useEffect(() => {
    const handleKeyPress = (event: KeyboardEvent) => {
      if (event.key === ' ' && selectedNodeId) {
        event.preventDefault();
        expandFromLemma(selectedNodeId);
      }
    };

    window.addEventListener('keydown', handleKeyPress);
    return () => window.removeEventListener('keydown', handleKeyPress);
  }, [selectedNodeId]);

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

      // 1) Ajouter tous les nœuds voisins uniques
      expansion.neighbors.forEach(neighbor => {
        if (!currentNodes.find(n => n.id === neighbor.lemma)) {
          currentNodes.push(createGraphNode(neighbor, false));
        }
      });

      // 2) Ajouter les nœuds manquants référencés par une relation
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

      // 3) Ajouter les relations EXACTES
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

  // --- config des contrôles (souris + flèches) ---
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

  // --- chargement initial du graphe ---
  useEffect(() => {
    const loadData = async () => {
      try {
        console.log('Initialisation SimpleLemmaGraph...');

        await lemmaDataService.initialize();

        // 1) Recherche du lemme de départ
        const searchResults = lemmaDataService.searchLemmas({
          query: initialQuery,
          limit: 1
        });

        if (searchResults.length === 0) {
          throw new Error(`Aucun lemme trouvé pour "${initialQuery}"`);
        }

        const centerLemma = searchResults[0];
        console.log('Lemme centre:', centerLemma);

        const nodes: GraphNode[] = [];
        const links: GraphLink[] = [];

        // 2) Ajout du nœud central
        const centerNode = createGraphNode(centerLemma, true);
        nodes.push(centerNode);

        // 3) Expansion via BFS sur l’atlas
        const expansion = lemmaDataService.expandLemma(centerLemma.lemma, 150, 2);
        console.log(
          'Expansion:',
          centerLemma.lemma,
          'neighbors:',
          expansion?.neighbors?.length || 0
        );

        if (expansion) {
          // 3A) Ajouter tous les voisins uniques
          expansion.neighbors.forEach(neighbor => {
            if (!nodes.find(n => n.id === neighbor.lemma)) {
              nodes.push(createGraphNode(neighbor, false));
            }
          });

          // 3B) Ajouter les nœuds manquants présents seulement dans les relations
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

          // 3C) Ajouter les relations EXACTES
          expansion.relations.forEach(rel => {
            if (
              !links.find(
                l => l.source === rel.source && l.target === rel.target
              )
            ) {
              links.push({
                source: rel.source,
                target: rel.target,
                weight: rel.weight
              });
            }
          });
        }

        console.log(`Graphe créé: ${nodes.length} nœuds, ${links.length} liens`);
        setGraphData({ nodes, links });
        setIsLoading(false);
      } catch (err: any) {
        console.error('Erreur chargement:', err);
        setError(err.message ?? 'Erreur inconnue');
        setIsLoading(false);
      }
    };

    loadData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // --- helpers ---
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

  // --- clic sur nœud : sélection SANS recréer les nœuds ---
  const handleNodeClick = (node: any) => {
    console.log('Clic sur lemme:', node.id);
    console.log('Nœuds avant clic:', graphData.nodes.length);

    setSelectedNodeId(node.id);

    setGraphData(prevData => {
      console.log('Nœuds dans prevData:', prevData.nodes.length);

      const next: GraphData = {
        ...prevData,
        nodes: prevData.nodes
      };

      next.nodes.forEach(n => {
        (n as any).isSelected = n.id === node.id;
      });

      console.log('Nœuds après clic:', next.nodes.length);
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

  // --- rendu ---

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
    <ForceGraph3D
      ref={forceGraphRef}
      width={width}
      height={height}
      graphData={graphData}
      backgroundColor="#111"
      controlType="orbit"
      // on laisse la physique par défaut, mais on joue sur la taille du texte

      nodeThreeObject={(node: any) => {
        const isSelected = node.isSelected;
        const isCenter = node.isCenter;
        const relationCount = node.relationCount || 0;
        const importance = Math.min(relationCount / 10, 1);

        const sprite = new THREE.Sprite();

        // 1) Taille de police (beaucoup plus petite qu'avant)
        let fontSize = 120;
        if (isSelected) fontSize = 200;
        else if (isCenter) fontSize = 170;
        else if (importance > 0.5) fontSize = 150;
        else if (importance > 0.2) fontSize = 135;
        else fontSize = 120;

        // 2) Couleur
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

        // 5) Taille 3D (plus petite)
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
  );
};
