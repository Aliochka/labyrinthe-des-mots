// src/components/synset/SimpleSynsetGraph.tsx
import React, { useEffect, useState, useRef } from 'react';
import ForceGraph3D from 'react-force-graph-3d';
import * as THREE from 'three';
import { SynsetDataService } from '../../services/SynsetDataService';

interface SimpleSynsetGraphProps {
  width?: number;
  height?: number;
  initialQuery?: string;
  onSynsetClick?: (synset: any) => void;
}

interface GraphNode {
  id: string;
  name: string;
  pos: string;
  lemmas?: string[];
  size?: number;
  color?: string;
  isCenter?: boolean;
  isSelected?: boolean;
  linkCount?: number;
  relationCount?: number;
  x?: number;
  y?: number;
  z?: number;
}

interface GraphLink {
  source: string;
  target: string;
}

interface GraphData {
  nodes: GraphNode[];
  links: GraphLink[];
}

export const SimpleSynsetGraph: React.FC<SimpleSynsetGraphProps> = ({
  width = 800,
  height = 600,
  initialQuery = 'entité',
  onSynsetClick
}) => {
  const [graphData, setGraphData] = useState<GraphData>({ nodes: [], links: [] });
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);

  const dataServiceRef = useRef<SynsetDataService>(new SynsetDataService());
  const forceGraphRef = useRef<any>(null);

  // ✅ nouveau : savoir si on a déjà fait le recentrage initial
  const hasInitialCameraRef = useRef(false);

  // --- helpers ---

  // Fonction pour sélectionner les meilleurs lemmas d'un synset
  const selectBestLemmas = (synset: any, maxLemmas: number = 3): string[] => {
    if (!synset.lemmas || synset.lemmas.length === 0) return [synset.id];

    if (synset.lemmas.length <= maxLemmas) return synset.lemmas;

    return synset.lemmas
      .slice() // pour éviter de trier le tableau source
      .sort((a: string, b: string) => a.length - b.length)
      .slice(0, maxLemmas);
  };

  // --- clavier : espace pour étendre depuis le nœud sélectionné ---

  useEffect(() => {
    const handleKeyPress = (event: KeyboardEvent) => {
      if (event.key === ' ' && selectedNodeId) {
        event.preventDefault();
        expandFromNode(selectedNodeId);
      }
    };

    window.addEventListener('keydown', handleKeyPress);
    return () => window.removeEventListener('keydown', handleKeyPress);
  }, [selectedNodeId]);

  const expandFromNode = async (nodeId: string) => {
    console.log('Expansion depuis:', nodeId);

    const expansion = dataServiceRef.current.expandSynset(nodeId, 50);
    console.log('Expansion depuis:', nodeId, 'neighbors:', expansion?.neighbors?.length || 0);
    if (!expansion) return;

    setGraphData(prevData => {
      const currentNodes = [...prevData.nodes];
      const currentLinks = [...prevData.links];

      //
      // --- 1) Ajouter tous les nœuds voisins uniques ---
      //
      expansion.neighbors.forEach(neighbor => {
        if (!currentNodes.find(n => n.id === neighbor.id)) {
          currentNodes.push({
            id: neighbor.id,
            name: selectBestLemmas(neighbor, 3).join(' • '),
            pos: neighbor.pos || 'n',
            lemmas: neighbor.lemmas,
            size: 10,
            color: '#4ecdc4',
            isCenter: false,
            isSelected: false,
            linkCount: expansion.neighbors.length,
            relationCount: neighbor.relationCount || 0
          });
        }
      });

      //
      // --- 2) Ajouter les nœuds manquants référencés par une relation ---
      //
      expansion.relations.forEach(rel => {
        // SOURCE
        if (!currentNodes.find(n => n.id === rel.source)) {
          const syn = dataServiceRef.current.getSynsetById(rel.source);
          if (syn) {
            currentNodes.push({
              id: syn.id,
              name: selectBestLemmas(syn).join(' • '),
              pos: syn.pos || 'n',
              lemmas: syn.lemmas,
              size: 10,
              color: '#888',
              isCenter: false,
              isSelected: false,
              linkCount: syn.relationCount || 0,
              relationCount: syn.relationCount || 0
            });
          }
        }

        // TARGET
        if (!currentNodes.find(n => n.id === rel.target)) {
          const syn = dataServiceRef.current.getSynsetById(rel.target);
          if (syn) {
            currentNodes.push({
              id: syn.id,
              name: selectBestLemmas(syn).join(' • '),
              pos: syn.pos || 'n',
              lemmas: syn.lemmas,
              size: 10,
              color: '#888',
              isCenter: false,
              isSelected: false,
              linkCount: syn.relationCount || 0,
              relationCount: syn.relationCount || 0
            });
          }
        }
      });

      //
      // --- 3) Ajouter les relations EXACTES ---
      //
      expansion.relations.forEach(rel => {
        if (!currentLinks.find(l => l.source === rel.source && l.target === rel.target)) {
          currentLinks.push({
            source: rel.source,
            target: rel.target
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

  // --- chargement initial du graphe (une seule fois) ---
  useEffect(() => {
    const loadData = async () => {
      try {
        console.log('Initialisation SimpleSynsetGraph...');

        await dataServiceRef.current.initialize();

        // 1) Recherche du synset de départ
        const searchResults = dataServiceRef.current.searchSynsets({ lemma: initialQuery });

        if (searchResults.length === 0) {
          throw new Error(`Aucun synset trouvé pour "${initialQuery}"`);
        }

        const centerSynset = searchResults[0];
        console.log('Synset centre:', centerSynset);

        const nodes: GraphNode[] = [];
        const links: GraphLink[] = [];

        //
        // 2) Ajout du nœud central
        //
        const centerNode: GraphNode = {
          id: centerSynset.id,
          name: selectBestLemmas(centerSynset, 3).join(' • '),
          pos: centerSynset.pos || 'n',
          lemmas: centerSynset.lemmas,
          size: 18,
          color: '#ff6b6b',
          isCenter: true,
          isSelected: false,
          linkCount: 0,
          relationCount: centerSynset.relationCount || 0
        };
        nodes.push(centerNode);

        //
        // 3) Expansion via Random Walk globale
        //
        const expansion = dataServiceRef.current.expandSynset(centerSynset.id, 150);
        console.log('Expansion:', centerSynset.id, 'neighbors:', expansion?.neighbors?.length || 0);

        if (expansion) {

          // --- 3A) Ajouter tous les nœuds voisins uniques ---
          expansion.neighbors.forEach(neighbor => {
            if (!nodes.find(n => n.id === neighbor.id)) {
              nodes.push({
                id: neighbor.id,
                name: selectBestLemmas(neighbor, 3).join(' • '),
                pos: neighbor.pos || 'n',
                lemmas: neighbor.lemmas,
                size: 12,
                color: '#4ecdc4',
                isCenter: false,
                isSelected: false,
                linkCount: expansion.neighbors.length,
                relationCount: neighbor.relationCount || 0
              });
            }
          });

          //
          // --- 3B) AJOUT DES NŒUDS MANQUANTS PRÉSENTS DANS LES RELATIONS ---
          //
          expansion.relations.forEach(rel => {
            // SOURCE
            if (!nodes.find(n => n.id === rel.source)) {
              const syn = dataServiceRef.current.getSynsetById(rel.source);
              if (syn) {
                nodes.push({
                  id: syn.id,
                  name: selectBestLemmas(syn).join(' • '),
                  pos: syn.pos || 'n',
                  lemmas: syn.lemmas,
                  size: 10,
                  color: '#888',
                  isCenter: false,
                  isSelected: false,
                  linkCount: syn.relationCount || 0,
                  relationCount: syn.relationCount || 0
                });
              }
            }

            // TARGET
            if (!nodes.find(n => n.id === rel.target)) {
              const syn = dataServiceRef.current.getSynsetById(rel.target);
              if (syn) {
                nodes.push({
                  id: syn.id,
                  name: selectBestLemmas(syn).join(' • '),
                  pos: syn.pos || 'n',
                  lemmas: syn.lemmas,
                  size: 10,
                  color: '#888',
                  isCenter: false,
                  isSelected: false,
                  linkCount: syn.relationCount || 0,
                  relationCount: syn.relationCount || 0
                });
              }
            }
          });

          //
          // --- 3C) Ajouter les relations EXACTES du random walk ---
          //
          expansion.relations.forEach(rel => {
            if (!links.find(l => l.source === rel.source && l.target === rel.target)) {
              links.push({
                source: rel.source,
                target: rel.target
              });
            }
          });

          centerNode.linkCount = expansion.relations.length;
        }

        //
        // 4) Finalisation
        //
        console.log(`Graphe créé: ${nodes.length} nœuds, ${links.length} liens`);
        setGraphData({ nodes, links });
        setIsLoading(false);

      } catch (err) {
        console.error('Erreur chargement:', err);
        setError(err instanceof Error ? err.message : 'Erreur inconnue');
        setIsLoading(false);
      }
    };

    loadData();
  }, []); // une seule fois au montage


  // --- clic sur nœud : sélection SANS recréer les nœuds ---

  const handleNodeClick = (node: any) => {
    console.log('Clic sur nœud:', node.id);
    console.log('Nœuds avant clic:', graphData.nodes.length);

    setSelectedNodeId(node.id);

    setGraphData(prevData => {
      console.log('Nœuds dans prevData:', prevData.nodes.length);

      // on garde le même tableau de nodes pour que ForceGraph réutilise les mêmes objets
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

    if (onSynsetClick) {
      onSynsetClick(node);
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
      // tu peux laisser la simu vivre, ou figer après un certain temps avec cooldownTicks
      // cooldownTicks={60}

      // Texte 3D orienté vers la caméra avec LOD
      nodeThreeObject={(node: any) => {
        const isSelected = node.isSelected;
        const isCenter = node.isCenter;
        const relationCount = node.relationCount || 0;
        const importance = Math.min(relationCount / 10, 1);

        const sprite = new THREE.Sprite();

        // -----------------------------
        // 1) Déterminer la taille de police selon le type de nœud
        // -----------------------------
        let fontSize = 200;
        if (isSelected) fontSize = 320;
        else if (isCenter) fontSize = 280;
        else if (importance > 0.5) fontSize = 240;
        else if (importance > 0.2) fontSize = 220;
        else fontSize = 180;

        // -----------------------------
        // 2) Déterminer la couleur
        // -----------------------------
        let color = '#f0f0f0';
        if (isSelected) color = '#ffff00';
        else if (isCenter) color = '#ff6b6b';
        else if (importance > 0.5) color = '#ffffff';
        else if (importance > 0.2) color = '#cccccc';
        else color = '#999999';

        // -----------------------------
        // 3) Canvas dynamique
        // -----------------------------
        const text = node.name || node.id;

        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d')!;

        ctx.font = `bold ${fontSize}px Arial`;
        const textWidth = ctx.measureText(text).width;

        // Taille du canvas = largeur du texte + marge
        canvas.width = textWidth + 200;
        canvas.height = fontSize * 2;

        // Reconfigurer le contexte après resize
        ctx.font = `bold ${fontSize}px Arial`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillStyle = color;

        // Ombres
        ctx.shadowColor = isSelected ? '#ffff00' : 'rgba(0, 0, 0, 0.3)';
        ctx.shadowBlur = isSelected ? 8 : 2;
        ctx.shadowOffsetX = isSelected ? 0 : 1;
        ctx.shadowOffsetY = isSelected ? 0 : 1;

        // Dessin final
        ctx.fillText(text, canvas.width / 2, canvas.height / 2);

        // -----------------------------
        // 4) Sprite Three.js
        // -----------------------------
        const texture = new THREE.CanvasTexture(canvas);
        texture.minFilter = THREE.LinearFilter;
        texture.magFilter = THREE.LinearFilter;

        sprite.material = new THREE.SpriteMaterial({
          map: texture,
          transparent: true,
          depthTest: false,
          alphaTest: 0.1
        });

        // -----------------------------
        // 5) Taille finale dans l’espace 3D
        // -----------------------------
        let scale = 80;
        if (isSelected) scale = 120;
        else if (isCenter) scale = 100;
        else if (importance > 0.5) scale = 90;
        else if (importance > 0.2) scale = 85;
        else scale = 70;

        sprite.scale.set(scale, scale * 0.3, 1);

        return sprite;
      }}

      nodeLabel=""
      onNodeClick={handleNodeClick}
      linkWidth={1.5}
      linkColor={() => '#cccccc'}
      linkOpacity={0.7}
      linkDirectionalParticles={0}
      linkVisibility={true}
      showNavInfo={false}
      nodeAutoColorBy=""
      onEngineStop={() => {
        const fg = forceGraphRef.current;
        if (!fg) return;

        // ✅ on ne recentre qu'une seule fois, au tout début
        if (hasInitialCameraRef.current) return;
        hasInitialCameraRef.current = true;

        const dist = 150; // distance caméra → centre
        const pos = { x: 0, y: 0, z: dist };

        fg.cameraPosition(pos, { x: 0, y: 0, z: 0 }, 2000);
      }}
    />
  );
};

export default SimpleSynsetGraph;
