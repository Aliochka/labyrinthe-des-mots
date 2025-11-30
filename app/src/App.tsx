// src/App.tsx
import { useEffect, useMemo, useState } from 'react';
import './App.css';

import { WordInput } from './components/ui/WordInput';
import { Graph3DView } from './visualization/Graph3DView';

import { expandFromWord, findPathBetweenWords } from './semantic-api/words';
import type {
  ExpandFromWordResult,
  FindPathBetweenWordsResult,
} from './types/api';
import { buildCombinedGraph } from './utils/graphUtils';

function App() {
  // État principal selon les spécifications
  const [firstWord, setFirstWord] = useState<string | null>(null);
  const [secondWord, setSecondWord] = useState<string | null>(null);

  const [expandFirst, setExpandFirst] = useState<ExpandFromWordResult | null>(null);
  const [pathResult, setPathResult] = useState<FindPathBetweenWordsResult | null>(null);

  // Animation du chemin
  const [animatedPathIds, setAnimatedPathIds] = useState<number[]>([]);

  // --- Handlers selon les spécifications ---

  const handleFirstWord = (word: string) => {
    // 1. Sauvegarder le premier mot
    setFirstWord(word);

    // 2. Appeler expandFromWord
    const res = expandFromWord(word, { depth: 2 });
    setExpandFirst(res);

    // 3. Réinitialiser tout le reste
    setSecondWord(null);
    setPathResult(null);
    setAnimatedPathIds([]);
  };

  const handleSecondWord = (word: string) => {
    // Si firstWord est undefined ou vide → on ne fait rien
    if (!firstWord) {
      return;
    }

    // 1. Sauvegarder le deuxième mot
    setSecondWord(word);

    // 2. Appeler findPathBetweenWords
    const resPath = findPathBetweenWords(firstWord, word, {
      maxDepth: 6,
    });
    setPathResult(resPath);

    // 3. Reset animation
    setAnimatedPathIds([]);
  };

  // --- Construction du graphe combiné et highlightNodeIds ---

  const { combinedGraph, highlightNodeIds: baseHighlightNodeIds } = useMemo(
    () => buildCombinedGraph(expandFirst, pathResult),
    [expandFirst, pathResult]
  );

  // --- Animation du chemin (éclaire nœud par nœud) ---

  useEffect(() => {
    if (!baseHighlightNodeIds.length) {
      setAnimatedPathIds([]);
      return;
    }

    // On révèle les ids un par un
    let i = 0;
    setAnimatedPathIds([baseHighlightNodeIds[0]]);

    const interval = setInterval(() => {
      i += 1;
      if (i >= baseHighlightNodeIds.length) {
        clearInterval(interval);
        return;
      }
      setAnimatedPathIds((prev) => {
        if (prev.includes(baseHighlightNodeIds[i])) return prev;
        return [...prev, baseHighlightNodeIds[i]];
      });
    }, 400); // 400ms entre chaque nœud

    return () => {
      clearInterval(interval);
    };
  }, [JSON.stringify(baseHighlightNodeIds)]);

  // On utilise la liste animée si présente, sinon tous les nœuds du chemin
  const finalHighlightNodeIds =
    animatedPathIds.length > 0 ? animatedPathIds : baseHighlightNodeIds;

  // --- Texte d'état UX ---

  let helperText = "Commence par entrer un premier mot.";
  if (firstWord && !secondWord) {
    helperText = `Exploration autour de « ${firstWord} ». Ajoute un deuxième mot pour tracer un chemin.`;
  } else if (firstWord && secondWord) {
    helperText = `Chemin de « ${firstWord} » à « ${secondWord} ».`;
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
            label="Mot de départ :"
            placeholder="ex : désert"
            onSubmit={handleFirstWord}
          />
          <WordInput
            label="Mot d'arrivée :"
            placeholder="ex : oasis"
            onSubmit={handleSecondWord}
          />
        </div>

        <p style={{ marginTop: '0.75rem', opacity: 0.8 }}>{helperText}</p>
      </section>

      {/* Vue unique : graphe combiné */}
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
          <Graph3DView
            graph={combinedGraph ?? expandFirst?.graph ?? null}
            highlightNodeIds={finalHighlightNodeIds}
            title="Labyrinthe 3D"
          />
        </div>
      </section>

      {/* Blocs debug avec JSON brut */}
      <section style={{ marginTop: '2rem' }}>
        <details>
          <summary style={{ cursor: 'pointer', marginBottom: '1rem' }}>
            🔍 Debug - expandFirst
          </summary>
          <pre
            style={{
              padding: '1rem',
              background: '#222',
              borderRadius: '0.5rem',
              overflow: 'auto',
              fontSize: '0.8rem',
            }}
          >
            {JSON.stringify(expandFirst, null, 2)}
          </pre>
        </details>

        <details style={{ marginTop: '1rem' }}>
          <summary style={{ cursor: 'pointer', marginBottom: '1rem' }}>
            🔍 Debug - pathResult
          </summary>
          <pre
            style={{
              padding: '1rem',
              background: '#222',
              borderRadius: '0.5rem',
              overflow: 'auto',
              fontSize: '0.8rem',
            }}
          >
            {JSON.stringify(pathResult, null, 2)}
          </pre>
        </details>

        <details style={{ marginTop: '1rem' }}>
          <summary style={{ cursor: 'pointer', marginBottom: '1rem' }}>
            🔍 Debug - combinedGraph
          </summary>
          <pre
            style={{
              padding: '1rem',
              background: '#222',
              borderRadius: '0.5rem',
              overflow: 'auto',
              fontSize: '0.8rem',
            }}
          >
            {JSON.stringify(combinedGraph, null, 2)}
          </pre>
        </details>
      </section>
    </div>
  );
}

export default App;
