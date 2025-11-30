// src/App.tsx
import { useEffect, useMemo, useState } from 'react';
import './App.css';

import { WordInput } from './components/ui/WordInput';
import { GraphView } from './components/graph/GraphView';

import { expandFromWord, findPathBetweenWords } from './semantic-api/words';
import type {
  ExpandFromWordResult,
  FindPathBetweenWordsResult,
} from './types/api';
import type { GraphSlice } from './types/graph';

function mergeGraphSlices(slices: Array<GraphSlice | null | undefined>): GraphSlice | null {
  const valid = slices.filter((s): s is GraphSlice => !!s);
  if (valid.length === 0) return null;

  const nodeMap = new Map<number, GraphSlice['nodes'][number]>();
  const edgeKeySet = new Set<string>();
  const edges: GraphSlice['edges'] = [];

  for (const slice of valid) {
    for (const n of slice.nodes) {
      nodeMap.set(n.id, n);
    }
    for (const e of slice.edges) {
      const key = `${e.from}-${e.to}-${e.type}`;
      if (!edgeKeySet.has(key)) {
        edgeKeySet.add(key);
        edges.push(e);
      }
    }
  }

  const nodes = Array.from(nodeMap.values());

  // On prend le centerId du premier slice qui en a un
  const centerId =
    valid.find((s) => s.centerId !== undefined)?.centerId ?? nodes[0]?.id;

  const depthExplored = Math.max(
    ...valid.map((s) => s.depthExplored ?? 0)
  );

  return {
    nodes,
    edges,
    centerId,
    depthExplored,
  };
}

function App() {
  // Mot 1 / Mot 2
  const [wordA, setWordA] = useState<string | null>(null);
  const [wordB, setWordB] = useState<string | null>(null);

  // Résultats d'API
  const [expandA, setExpandA] = useState<ExpandFromWordResult | null>(null);
  const [expandB, setExpandB] = useState<ExpandFromWordResult | null>(null);
  const [pathResult, setPathResult] = useState<FindPathBetweenWordsResult | null>(null);

  // Animation du chemin
  const [animatedPathIds, setAnimatedPathIds] = useState<number[]>([]);

  // --- Handlers ---

  const handleWordA = (word: string) => {
    setWordA(word);
    setWordB(null);          // on reset le mot B
    setExpandB(null);        // et tout ce qui en dépend
    setPathResult(null);
    setAnimatedPathIds([]);

    const res = expandFromWord(word, { depth: 2 });
    setExpandA(res);
  };

  const handleWordB = (word: string) => {
    if (!wordA) {
      // On pourrait afficher un petit message d'erreur,
      // mais pour l'instant on se contente d'ignorer si A n'est pas encore défini.
      return;
    }

    setWordB(word);
    setAnimatedPathIds([]);

    const resB = expandFromWord(word, { depth: 2 });
    setExpandB(resB);

    const resPath = findPathBetweenWords(wordA, word, {
      maxDepth: 6,
    });
    setPathResult(resPath);
  };

  // --- Construction du graph de chemin (à partir du 1er chemin trouvé) ---

  let pathGraph: GraphSlice | null = null;
  let pathNodeIds: number[] = [];

  if (
    pathResult &&
    pathResult.pathResult &&
    pathResult.pathResult.paths &&
    pathResult.pathResult.paths[0]
  ) {
    const p = pathResult.pathResult.paths[0];
    pathGraph = {
      nodes: p.nodes,
      edges: p.edges,
      centerId: p.nodes[0]?.id,
      depthExplored: (p.nodes.length ?? 1) - 1,
    };
    pathNodeIds = p.nodes.map((n) => n.id);
  }

  // --- Fusion des graphes : halo mot1 + halo mot2 + chemin ---

  const mergedGraph: GraphSlice | null = useMemo(
    () =>
      mergeGraphSlices([
        expandA?.graph ?? null,
        expandB?.graph ?? null,
        pathGraph,
      ]),
    [expandA, expandB, pathGraph]
  );

  // --- Animation du chemin (éclaire nœud par nœud) ---

  useEffect(() => {
    if (!pathNodeIds.length) {
      setAnimatedPathIds([]);
      return;
    }

    // On révèle les ids un par un
    let i = 0;
    setAnimatedPathIds([pathNodeIds[0]]);

    const interval = setInterval(() => {
      i += 1;
      if (i >= pathNodeIds.length) {
        clearInterval(interval);
        return;
      }
      setAnimatedPathIds((prev) => {
        if (prev.includes(pathNodeIds[i])) return prev;
        return [...prev, pathNodeIds[i]];
      });
    }, 400); // 400ms entre chaque nœud, à ajuster

    return () => {
      clearInterval(interval);
    };
  }, [JSON.stringify(pathNodeIds)]);

  // On utilise la liste animée si présente, sinon tous les nœuds du chemin
  const highlightNodeIds =
    animatedPathIds.length > 0 ? animatedPathIds : pathNodeIds;

  // --- Texte d'état UX (État 1 / État 2) ---

  let helperText = "Commence par entrer un premier mot.";
  if (wordA && !wordB) {
    helperText = `Exploration autour de « ${wordA} ». Ajoute un deuxième mot pour tracer un chemin.`;
  } else if (wordA && wordB) {
    helperText = `Chemin de « ${wordA} » à « ${wordB} ».`;
  }

  return (
    <div
      style={{
        minHeight: '100vh',
        padding: '2rem',
        fontFamily: 'system-ui, sans-serif',
        background: '#111',
        color: '#f5f5f5',
      }}
    >
      <h1 style={{ marginBottom: '1rem' }}>Labyrinthe des mots (proto)</h1>

      {/* Contrôles haut de page */}
      <section style={{ marginBottom: '1.5rem' }}>
        <p style={{ marginBottom: '0.75rem' }}>
          🧭 Saisis un premier mot pour explorer son voisinage, puis un deuxième pour tracer un chemin entre les deux.
        </p>

        <div
          style={{
            display: 'flex',
            flexWrap: 'wrap',
            gap: '1rem',
            alignItems: 'flex-end',
          }}
        >
          <WordInput
            label="Mot 1 :"
            placeholder="ex : desert"
            onSubmit={handleWordA}
          />
          <WordInput
            label="Mot 2 :"
            placeholder="ex : oasis"
            onSubmit={handleWordB}
          />
        </div>

        <p style={{ marginTop: '0.75rem', opacity: 0.8 }}>{helperText}</p>
      </section>

      {/* Vue unique : graphe fusionné */}
      <section>
        <div
          style={{
            borderRadius: '0.75rem',
            overflow: 'hidden',
            border: '1px solid #333',
            background: '#000',
            height: '70vh',
            minHeight: '400px',
          }}
        >
          {mergedGraph ? (
            <GraphView
              graph={mergedGraph}
              highlightNodeIds={highlightNodeIds}
              title={
                wordA && wordB
                  ? `Chemin : ${wordA} → ${wordB}`
                  : wordA
                    ? `Exploration autour de « ${wordA} »`
                    : "Graph lexical"
              }
            />
          ) : (
            <div
              style={{
                height: '100%',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                opacity: 0.6,
              }}
            >
              <p>Aucun graphe encore chargé. Commence par entrer un mot.</p>
            </div>
          )}
        </div>
      </section>
    </div>
  );
}

export default App;
