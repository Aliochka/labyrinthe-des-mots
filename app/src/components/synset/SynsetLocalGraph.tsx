// src/components/synset/SynsetLocalGraph.tsx
/**
 * Composant d'exploration locale basé sur les synsets
 * Remplace le système basé sur les lemmas individuels
 */

import React, { useEffect, useRef, useState, useCallback } from 'react';
import ForceGraph3D from 'react-force-graph-3d';

import type {
  LocalSynsetNode,
  SynsetRelation,
  LocalSynsetGraph,
  SynsetExpandResponse
} from '../../types/synset';

import { computeLocalSynsetPositions, createStartPositionsForNewSynsets, generateSynsetLabel, calculateSynsetNodeSize } from '../../utils/synsetPositions';
import { globalAnimationManager } from '../../utils/animationUtils';
import { SynsetDataService } from '../../services/SynsetDataService';

/**
 * Props du composant SynsetLocalGraph
 */
interface SynsetLocalGraphProps {
  /** Synset ID initial ou lemma à rechercher */
  initialQuery: string;

  /** Type de requête initiale */
  queryType?: 'synsetId' | 'lemma';

  /** Callback lors du clic sur un synset */
  onSynsetClick?: (synset: LocalSynsetNode) => void;

  /** Configuration visuelle */
  config?: {
    width?: number;
    height?: number;
    backgroundColor?: string;
    showLabels?: boolean;
    showTooltips?: boolean;
    animationDuration?: number;
    maxLabelLength?: number;
  };
}

/**
 * Composant principal d'exploration synset-centric
 */
export const SynsetLocalGraph: React.FC<SynsetLocalGraphProps> = ({
  initialQuery,
  queryType = 'lemma',
  onSynsetClick,
  config = {}
}) => {
  // Configuration par défaut
  const {
    width = 800,
    height = 600,
    backgroundColor = '#000011',
    showLabels = true,
    showTooltips = true,
    animationDuration = 600,
    maxLabelLength = 25
  } = config;

  // State du graphe local
  const [localGraph, setLocalGraph] = useState<LocalSynsetGraph>({ nodes: [], relations: [] });
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [currentCenterSynset, setCurrentCenterSynset] = useState<LocalSynsetNode | null>(null);

  // Références pour l'animation
  const forceRef = useRef<any>(null);
  const currentPositionsRef = useRef<Record<string, any>>({});
  const animationIdRef = useRef<number>(0);

  // Service de données
  const dataServiceRef = useRef<SynsetDataService>(new SynsetDataService());

  // Initialisation
  useEffect(() => {
    if (initialQuery) {
      initializeFromQuery(initialQuery, queryType);
    }
  }, [initialQuery, queryType]);

  /**
   * Initialise le graphe à partir d'une requête
   */
  const initializeFromQuery = useCallback(async (
    query: string,
    type: 'synsetId' | 'lemma'
  ) => {
    setIsLoading(true);
    setError(null);

    try {
      let synsetId: string;

      if (type === 'synsetId') {
        synsetId = query;
      } else {
        // Rechercher le synset par lemma
        const searchResponse = await fetch(`${apiBaseUrl}/search?lemma=${encodeURIComponent(query)}`);
        if (!searchResponse.ok) throw new Error('Recherche échouée');

        const searchResults = await searchResponse.json();
        if (searchResults.length === 0) {
          throw new Error(`Aucun synset trouvé pour "${query}"`);
        }

        synsetId = searchResults[0].id; // Prendre le premier résultat
      }

      await initializeFromSynset(synsetId);

    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Erreur inconnue';
      setError(errorMessage);
      console.error('Erreur initialisation:', err);
    } finally {
      setIsLoading(false);
    }
  }, []);

  /**
   * Initialise le graphe avec un synset spécifique
   */
  const initializeFromSynset = useCallback(async (synsetId: string) => {
    console.log(`Initialisation graphe pour synset "${synsetId}"`);

    // Charger l'expansion du synset depuis les données locales
    const data = dataServiceRef.current.expandSynset(synsetId);
    if (!data) throw new Error(`Synset ${synsetId} non trouvé`);

    // Construire les noeuds locaux
    const centerNode: LocalSynsetNode = {
      ...data.centerNode,
      isCenter: true,
      isNew: false,
      isHighlighted: false
    };

    const neighborNodes: LocalSynsetNode[] = data.neighbors.map(synset => ({
      ...synset,
      isCenter: false,
      isNew: false,
      isHighlighted: false
    }));

    const allNodes = [centerNode, ...neighborNodes];

    // Calculer les positions locales
    const localPositions = computeLocalSynsetPositions(allNodes);

    // Appliquer les positions aux noeuds
    allNodes.forEach(node => {
      const pos = localPositions[node.id];
      if (pos) {
        node.x = pos.x;
        node.y = pos.y;
        node.z = pos.z;
      }
    });

    // Sauvegarder les positions
    currentPositionsRef.current = localPositions;

    // Construire le graphe
    const newGraph: LocalSynsetGraph = {
      nodes: allNodes,
      relations: data.relations
    };

    setLocalGraph(newGraph);
    setCurrentCenterSynset(centerNode);

    // Désactiver les forces physiques
    setTimeout(() => {
      if (forceRef.current) {
        forceRef.current.d3Force('charge', null);
        forceRef.current.d3Force('link', null);
        forceRef.current.d3Force('center', null);
      }
    }, 100);

  }, []);

  /**
   * Étend le graphe avec de nouveaux voisins d'un synset
   */
  const expandFromSynset = useCallback(async (
    clickedSynset: LocalSynsetNode
  ) => {
    console.log(`Expansion graphe depuis synset "${clickedSynset.id}"`);

    setIsLoading(true);
    try {
      const response = await fetch(`${apiBaseUrl}/expand/${clickedSynset.id}`);
      if (!response.ok) throw new Error('Expansion échouée');

      const data: SynsetExpandResponse = await response.json();

      const currentNodes = localGraph.nodes;
      const currentRelations = localGraph.relations;

      // Identifier les nouveaux synsets
      const existingSynsetIds = new Set(currentNodes.map(n => n.id));
      const newSynsets = data.neighbors.filter(s => !existingSynsetIds.has(s.id));

      console.log(`${newSynsets.length} nouveaux synsets a ajouter`);

      if (newSynsets.length === 0) {
        console.log('Aucun nouveau synset, pas d\'animation');
        setIsLoading(false);
        return;
      }

      // Créer les nouveaux noeuds locaux
      const newLocalNodes: LocalSynsetNode[] = newSynsets.map(synset => ({
        ...synset,
        isCenter: false,
        isNew: true,
        isHighlighted: false
      }));

      // Tous les noeuds du nouveau graphe
      const allNodes = [...currentNodes, ...newLocalNodes];

      // Garder l'ancien centre, marquer le synset cliqué comme highlighted
      allNodes.forEach(node => {
        if (node.id === clickedSynset.id) {
          node.isHighlighted = true;
        }
        // Ne pas changer le centre existant
      });

      // Calculer les positions SEULEMENT pour les nouveaux nœuds
      // en préservant les positions existantes
      const targetPositions = { ...currentPositionsRef.current };

      // Placer les nouveaux synsets autour du synset cliqué
      const clickedPosition = currentPositionsRef.current[clickedSynset.id] || { x: 0, y: 0, z: 0 };
      newLocalNodes.forEach((node, index) => {
        const angle = (index * 2 * Math.PI) / newLocalNodes.length;
        const radius = 120; // Distance du synset cliqué
        targetPositions[node.id] = {
          x: clickedPosition.x + Math.cos(angle) * radius,
          y: clickedPosition.y + Math.sin(angle) * radius * 0.5,
          z: clickedPosition.z + (Math.random() - 0.5) * 80
        };
      });

      // Créer les positions de départ pour l'animation
      // Les nouveaux nœuds commencent près du synset cliqué
      const startPositions = { ...currentPositionsRef.current };
      newLocalNodes.forEach(node => {
        startPositions[node.id] = {
          x: clickedPosition.x + (Math.random() - 0.5) * 40,
          y: clickedPosition.y + (Math.random() - 0.5) * 40,
          z: clickedPosition.z + (Math.random() - 0.5) * 40
        };
      });

      // Nouvelles relations
      const newRelations = data.relations.filter(relation => {
        const relationExists = currentRelations.some(existing =>
          existing.source === relation.source && existing.target === relation.target
        );
        return !relationExists;
      });

      // Construire le nouveau graphe
      const updatedGraph: LocalSynsetGraph = {
        nodes: allNodes,
        relations: [...currentRelations, ...newRelations]
      };

      // Appliquer les positions de départ
      updatedGraph.nodes.forEach(node => {
        const startPos = startPositions[node.id];
        if (startPos) {
          node.x = startPos.x;
          node.y = startPos.y;
          node.z = startPos.z;
        }
      });

      // Mettre à jour le graphe avec positions de départ
      setLocalGraph(updatedGraph);
      setCurrentCenterSynset(allNodes.find(n => n.isCenter) || null);

      // Animer vers les positions finales
      const animationId = `expand_${++animationIdRef.current}`;

      await globalAnimationManager.animatePositions(
        animationId,
        startPositions,
        targetPositions,
        animationDuration,
        {
          onUpdate: (positions) => {
            setLocalGraph(currentGraph => ({
              ...currentGraph,
              nodes: currentGraph.nodes.map(node => ({
                ...node,
                x: positions[node.id]?.x ?? node.x,
                y: positions[node.id]?.y ?? node.y,
                z: positions[node.id]?.z ?? node.z
              }))
            }));
          },
          onComplete: () => {
            console.log('Animation d\'expansion terminee');
            currentPositionsRef.current = targetPositions;

            // Nettoyer les marqueurs "nouveau"
            setLocalGraph(currentGraph => ({
              ...currentGraph,
              nodes: currentGraph.nodes.map(node => ({
                ...node,
                isNew: false
              }))
            }));
          }
        }
      );

    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Erreur expansion';
      setError(errorMessage);
      console.error('Erreur expansion:', err);
    } finally {
      setIsLoading(false);
    }
  }, [localGraph, animationDuration]);

  /**
   * Gestionnaire de clic sur un synset
   */
  const handleSynsetClick = useCallback((synset: LocalSynsetNode) => {
    if (isLoading) return;

    console.log(`Clic sur synset "${synset.id}" (lemmas: ${synset.lemmas.join(', ')})`);

    // Callback externe
    onSynsetClick?.(synset);

    // Charger les voisins du synset cliqué
    expandFromSynset(synset);
  }, [isLoading, onSynsetClick, expandFromSynset]);

  /**
   * Génération des labels de synsets
   */
  const renderSynsetLabel = useCallback((synset: LocalSynsetNode) => {
    if (!showLabels) return '';
    return generateSynsetLabel(synset, maxLabelLength);
  }, [showLabels, maxLabelLength]);

  /**
   * Génération des tooltips
   */
  const renderSynsetTooltip = useCallback((synset: LocalSynsetNode) => {
    if (!showTooltips) return '';

    const lemmas = synset.lemmas.join(', ');
    const definition = synset.gloss || 'Pas de définition';

    return `<div style="max-width: 250px; padding: 8px; background: rgba(0,0,0,0.9); color: white; border-radius: 4px;">
      <div style="font-weight: bold; margin-bottom: 4px;">${lemmas}</div>
      <div style="font-size: 11px; opacity: 0.8;">${definition}</div>
      <div style="font-size: 10px; margin-top: 4px; opacity: 0.6;">ID: ${synset.id} | POS: ${synset.pos}</div>
    </div>`;
  }, [showTooltips]);

  /**
   * Style des noeuds synsets
   */
  const getSynsetColor = useCallback((synset: LocalSynsetNode) => {
    if (synset.isCenter) return '#ff6b35';      // Orange pour centre
    if (synset.isNew) return '#4ade80';         // Vert pour nouveaux
    if (synset.isHighlighted) return '#f59e0b'; // Jaune pour surlignés

    // Couleur selon POS
    switch (synset.pos) {
      case 'n': return '#60a5fa';  // Bleu pour noms
      case 'v': return '#a78bfa';  // Violet pour verbes
      case 'a': return '#fb7185';  // Rose pour adjectifs
      case 'r': return '#34d399';  // Vert pour adverbes
      default: return '#9ca3af';   // Gris par défaut
    }
  }, []);

  /**
   * Taille des noeuds synsets
   */
  const getSynsetSize = useCallback((synset: LocalSynsetNode) => {
    return calculateSynsetNodeSize(synset);
  }, []);

  /**
   * Style des relations
   */
  const getRelationColor = useCallback((relation: SynsetRelation) => {
    // Couleur selon type de relation
    switch (relation.type) {
      case 'hypernym': return '#3b82f6';   // Bleu
      case 'hyponym': return '#10b981';    // Vert
      case 'meronym': return '#f59e0b';    // Orange
      case 'holonym': return '#8b5cf6';    // Violet
      case 'antonym': return '#ef4444';    // Rouge
      case 'similar': return '#06b6d4';    // Cyan
      default: return '#6b7280';           // Gris
    }
  }, []);

  /**
   * Cleanup à la destruction
   */
  useEffect(() => {
    return () => {
      globalAnimationManager.stopAllAnimations();
    };
  }, []);

  // Interface de statut
  const statusStyle: React.CSSProperties = {
    position: 'absolute',
    top: 10,
    left: 10,
    background: 'rgba(0,0,0,0.9)',
    color: 'white',
    padding: '12px',
    borderRadius: '8px',
    fontSize: '12px',
    zIndex: 1000,
    minWidth: '250px'
  };

  return (
    <div style={{ position: 'relative', width, height }}>
      {/* Interface de statut */}
      <div style={statusStyle}>
        <div style={{ fontWeight: 'bold', marginBottom: '6px' }}>
          [BRAIN] Exploration Synset-Centric
        </div>

        {currentCenterSynset && (
          <div style={{ marginBottom: '4px' }}>
            Centre: <strong>{generateSynsetLabel(currentCenterSynset, 20)}</strong>
          </div>
        )}

        <div style={{ marginBottom: '4px' }}>
          Synsets: {localGraph.nodes.length} | Relations: {localGraph.relations.length}
        </div>

        {isLoading && <div style={{ color: '#60a5fa' }}>Chargement...</div>}
        {error && <div style={{ color: '#ef4444' }}>Erreur: {error}</div>}

        <div style={{ fontSize: '10px', marginTop: '6px', opacity: 0.7 }}>
          Cliquez sur un synset pour explorer ses voisins
        </div>
      </div>

      {/* Graphe 3D synsets */}
      <ForceGraph3D
        ref={forceRef}
        width={width}
        height={height}
        backgroundColor={backgroundColor}
        graphData={{
          nodes: localGraph.nodes,
          links: localGraph.relations.map(rel => ({
            source: rel.source,
            target: rel.target,
            type: rel.type
          }))
        }}

        // Configuration des noeuds synsets
        nodeId="id"
        nodeLabel={renderSynsetTooltip}
        nodeColor={getSynsetColor}
        nodeVal={getSynsetSize}
        nodeResolution={16}
        onNodeClick={handleSynsetClick}

        // Configuration des liens
        linkColor={getRelationColor}
        linkWidth={2}
        linkOpacity={0.7}
        linkDirectionalArrowLength={6}
        linkDirectionalArrowRelPos={0.8}

        // Labels flottants - désactivés temporairement pour éviter l'erreur THREE
        nodeThreeObject={undefined}

        // Désactivation des forces
        enableNodeDrag={false}
        cooldownTime={0}
        d3AlphaDecay={1}
        d3VelocityDecay={1}

        // Configuration des contrôles
        showNavInfo={false}
        controlType="orbit"
      />
    </div>
  );
};

/**
 * Fonction helper pour créer des textures de texte
 */
function createTextTexture(text: string): any {
  const canvas = document.createElement('canvas');
  const context = canvas.getContext('2d')!;
  canvas.width = 256;
  canvas.height = 64;

  context.fillStyle = 'rgba(0, 0, 0, 0.8)';
  context.fillRect(0, 0, canvas.width, canvas.height);

  context.fillStyle = 'white';
  context.font = '14px Arial';
  context.textAlign = 'center';
  context.textBaseline = 'middle';
  context.fillText(text, canvas.width / 2, canvas.height / 2);

  return new (window as any).THREE.CanvasTexture(canvas);
}

export default SynsetLocalGraph;