// src/App.tsx
import React, { useEffect, useMemo, useRef, useState, useCallback } from 'react';
import './App.css';

import { ControlPanel } from './components/ui/ControlPanel';
import { Graph3DView } from './visualization/Graph3DView';

import { loadWordnetData, type WordnetData } from './wordnet/loadData';
import {
  expandFromWord,
  findPathBetweenWords,
  type ExpandFromWordResult,
  type FindPathBetweenWordsResult,
  type GraphSlice
} from './wordnet/semantic-api';

// Fonction pour fusionner deux graphiques
function mergeGraphs(graph1: GraphSlice, graph2: GraphSlice): GraphSlice {
  const nodeMap = new Map();
  const edgeSet = new Set();

  // Ajouter tous les nœuds de graph1
  graph1.nodes.forEach(node => {
    nodeMap.set(node.id, node);
  });

  // Ajouter tous les nœuds de graph2 (sans doublons)
  graph2.nodes.forEach(node => {
    if (!nodeMap.has(node.id)) {
      nodeMap.set(node.id, node);
    }
  });

  // Ajouter toutes les arêtes de graph1
  graph1.edges.forEach(edge => {
    const edgeKey = `${edge.source}-${edge.target}-${edge.relation}`;
    edgeSet.add(edgeKey);
  });

  // Ajouter toutes les arêtes de graph2 (sans doublons)
  graph2.edges.forEach(edge => {
    const edgeKey = `${edge.source}-${edge.target}-${edge.relation}`;
    edgeSet.add(edgeKey);
  });

  // Reconstruire les arrays
  const mergedNodes = Array.from(nodeMap.values());
  const mergedEdges = [];

  // Reconstruire les edges depuis le Set
  graph1.edges.forEach(edge => mergedEdges.push(edge));
  graph2.edges.forEach(edge => {
    const edgeKey = `${edge.source}-${edge.target}-${edge.relation}`;
    const alreadyExists = graph1.edges.some(e1 =>
      e1.source === edge.source && e1.target === edge.target && e1.relation === edge.relation
    );
    if (!alreadyExists) {
      mergedEdges.push(edge);
    }
  });

  return {
    centerId: graph1.centerId, // Garder le centre original
    nodes: mergedNodes,
    edges: mergedEdges
  };
}

function App() {

  // Nettoyer le localStorage au démarrage pour une session fraîche
  localStorage.removeItem('expandFirst');
  localStorage.removeItem('highlightNodeIds');

  // Version simplifiée avec refs pour éviter les re-renders
  const firstWordRef = useRef<string | null>(null);
  const wordPathRef = useRef<string[]>([]);
  const highlightedIdsRef = useRef<number[]>([]);

  const [displayWordPath, setDisplayWordPath] = useState<string[]>([]);
  const [highlightNodeIds, setHighlightNodeIds] = useState<number[]>(() => {
    const saved = localStorage.getItem('highlightNodeIds');
    try {
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });
  const [secondWord, setSecondWord] = useState<string | null>(null);

  const [expandFirst, setExpandFirst] = useState<ExpandFromWordResult | null>(() => {
    const saved = localStorage.getItem('expandFirst');
    try {
      return saved ? JSON.parse(saved) : null;
    } catch {
      return null;
    }
  });

  // Ref pour accéder à la valeur actuelle d'expandFirst dans les handlers
  const expandFirstRef = useRef<ExpandFromWordResult | null>(expandFirst);

  // Synchroniser la ref avec le state
  useEffect(() => {
    expandFirstRef.current = expandFirst;
  }, [expandFirst]);

  // Données WordNet
  const [wordnetData, setWordnetData] = useState<WordnetData | null>(null);
  const wordnetDataRef = useRef<WordnetData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  // --- Chargement des données WordNet au démarrage ---
  useEffect(() => {
    const loadData = async () => {
      try {
        setIsLoading(true);
        setLoadError(null);
        const data = await loadWordnetData();
        setWordnetData(data);
        wordnetDataRef.current = data; // Synchroniser la ref
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Erreur de chargement des données';
        setLoadError(errorMessage);
        console.error('Erreur chargement WordNet:', error);
      } finally {
        setIsLoading(false);
      }
    };

    loadData();
  }, []);

  // Synchroniser cumulativePathIds quand expandFirst change - TEMPORAIREMENT DÉSACTIVÉ
  // useEffect(() => {
  //   if (expandFirst?.status === 'OK' && expandFirst.usedSynsetId && firstWord && wordPath.length === 1) {
  //     // Initialiser le chemin cumulatif avec le premier synset
  //     setCumulativePathIds([expandFirst.usedSynsetId]);
  //   }
  // }, [expandFirst, firstWord, wordPath.length]);

  // --- Handlers selon les spécifications ---

  const handleFirstWord = (word: string) => {
    // 1. Sauvegarder le premier mot
    firstWordRef.current = word;

    // 2. Appeler expandFromWord avec la ref (toujours actuelle)
    const currentData = wordnetDataRef.current;
    if (currentData) {
      const res = expandFromWord(word, currentData, {
        depth: 3,
        maxNodes: 100, // Limité à 100 nœuds pour plus de clarté
        allowedRelations: ["HYPERNYM", "HYPONYM", "ANTONYM"]
      });
      setExpandFirst(res);
      localStorage.setItem('expandFirst', JSON.stringify(res));
    }

    // 3. Réinitialiser tout le reste
    setSecondWord(null);
    wordPathRef.current = [word];
    setDisplayWordPath([word]);
    highlightedIdsRef.current = [];
    setHighlightNodeIds([]);
  };

  const handleSecondWord = (word: string) => {
    setSecondWord(word);
  };

  // Nouvelle fonction pour gérer les clics sur les mots dans le graphique
  const handleWordClick = useCallback((word: string) => {
    try {
      // Version avec useRef pour éviter les re-renders
      if (!firstWordRef.current || wordPathRef.current.length === 0) {
        firstWordRef.current = word;
        wordPathRef.current = [word];
        setDisplayWordPath([word]);

        // Appeler expandFromWord pour créer le graphique initial et obtenir l'ID
        const currentData = wordnetDataRef.current;
        if (currentData) {
          const res = expandFromWord(word, currentData, {
            depth: 3,
            maxNodes: 100,
            allowedRelations: ["HYPERNYM", "HYPONYM", "ANTONYM"]
          });
          setExpandFirst(res);
          localStorage.setItem('expandFirst', JSON.stringify(res));

          // Initialiser les IDs surlignés si on a un synset ID
          if (res.status === 'OK' && res.usedSynsetId) {
            const initialIds = [res.usedSynsetId];
            highlightedIdsRef.current = initialIds;
            setHighlightNodeIds(initialIds);
            localStorage.setItem('highlightNodeIds', JSON.stringify(initialIds));
          }
        }
      } else {
        // Force-access aux valeurs actuelles via une fonction
        const getCurrentExpandFirst = () => {
          // Essayer d'abord la ref, puis le state directement
          return expandFirstRef.current || expandFirst;
        };

        const currentExpandFirst = getCurrentExpandFirst();
        let graphToUse = currentExpandFirst?.status === 'OK' ? currentExpandFirst.graph : null;

        if (graphToUse) {
          const clickedNode = graphToUse.nodes.find(node =>
            node.lemmas.some(lemma => lemma === word)
          );

          if (clickedNode) {
            // Ajouter au chemin de mots
            const newWordPath = [...wordPathRef.current, word];
            wordPathRef.current = newWordPath;
            setDisplayWordPath(newWordPath);

            // Ajouter au chemin de synset IDs pour le highlighting
            const newHighlightIds = [...highlightedIdsRef.current, clickedNode.id];
            highlightedIdsRef.current = newHighlightIds;
            setHighlightNodeIds(newHighlightIds);
            localStorage.setItem('highlightNodeIds', JSON.stringify(newHighlightIds));
            setSecondWord(word);

            // Expansion progressive - ajouter les connexions du mot cliqué
            const currentData = wordnetDataRef.current;

            if (currentData) {
              // Faire une expansion autour du mot cliqué
              const expansionResult = expandFromWord(word, currentData, {
                depth: 3,
                maxNodes: 50,
                allowedRelations: ["HYPERNYM", "HYPONYM", "ANTONYM", "SIMILAR_TO", "ALSO"]
              });

              if (expansionResult.status === 'OK' && expansionResult.graph) {
                // Fusionner avec le graphique existant
                const currentGraph = expandFirstRef.current;
                if (currentGraph?.status === 'OK' && currentGraph.graph) {
                  const mergedGraph = mergeGraphs(currentGraph.graph, expansionResult.graph);
                  const newExpandFirst = { ...currentGraph, graph: mergedGraph };
                  setExpandFirst(newExpandFirst);
                  expandFirstRef.current = newExpandFirst;
                  localStorage.setItem('expandFirst', JSON.stringify(newExpandFirst));
                }
              }
            }
          }
        } else {
          // Fallback
          wordPathRef.current = [...wordPathRef.current, word];
          setDisplayWordPath([...wordPathRef.current]);
        }
      }
    } catch (error) {
      console.error('Error in handleWordClick:', error);
    }
  }, [expandFirst, wordnetData]); // Dépendances critiques

  // Fonction pour réinitialiser le chemin
  const handleResetPath = () => {
    firstWordRef.current = null;
    wordPathRef.current = [];
    highlightedIdsRef.current = [];
    setDisplayWordPath([]);
    setHighlightNodeIds([]);
    setSecondWord(null);
    setExpandFirst(null);
    localStorage.removeItem('expandFirst');
    localStorage.removeItem('highlightNodeIds');
  };

  // Version simplifiée - juste passer directement les données au Graph3DView
  const displayGraph = expandFirst?.status === 'OK' ? expandFirst.graph : null;



  // --- Texte d'état UX ---

  let helperText = "Commence par entrer un premier mot.";
  if (loadError) {
    helperText = `❌ Erreur: ${loadError}`;
  } else if (isLoading) {
    helperText = "🔄 Chargement des données WordNet...";
  } else if (firstWordRef.current && !secondWord) {
    if (expandFirst?.status === 'WORD_NOT_FOUND') {
      helperText = `❌ Le mot "${firstWordRef.current}" n'a pas été trouvé.`;
    } else if (expandFirst?.status === 'AMBIGUOUS') {
      helperText = `⚠️ Le mot "${firstWordRef.current}" a plusieurs sens. Choix automatique appliqué.`;
    } else {
      helperText = `Exploration autour de « ${firstWordRef.current} ». Ajoute un deuxième mot pour tracer un chemin.`;
    }
  } else if (firstWordRef.current && secondWord) {
    // Version simplifiée sans pathResult pour le test
    helperText = `Exploration entre « ${firstWordRef.current} » et « ${secondWord} ».`;
  }

  return (
    <div
      style={{
        height: '100vh',
        fontFamily: 'system-ui, sans-serif',
        background: '#111',
        color: '#f5f5f5',
        position: 'relative',
        overflow: 'hidden',
      }}
    >
      {/* Panneau de contrôle flottant */}
      <ControlPanel
        firstWord={firstWordRef.current}
        secondWord={secondWord}
        helperText={helperText}
        isLoading={isLoading}
        wordPath={displayWordPath}
        onFirstWordSubmit={handleFirstWord}
        onSecondWordSubmit={handleSecondWord}
        onResetPath={handleResetPath}
      />

      {/* Graphe plein écran */}
      <Graph3DView
        graph={displayGraph}
        highlightNodeIds={highlightNodeIds}
        onWordClick={handleWordClick}
      />

    </div>
  );
}

export default App;
