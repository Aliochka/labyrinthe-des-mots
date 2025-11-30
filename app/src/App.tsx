// src/App.tsx
import { useState } from 'react';
import './App.css';

import { WordInput } from './components/ui/WordInput';
import { expandFromWord, findPathBetweenWords } from './semantic-api/words';
import type { ExpandFromWordResult, FindPathBetweenWordsResult } from './types/api';

function App() {
  const [lastWord, setLastWord] = useState<string | null>(null);
  const [expandResult, setExpandResult] = useState<ExpandFromWordResult | null>(null);

  const [lastWordA, setLastWordA] = useState<string | null>(null);
  const [lastWordB, setLastWordB] = useState<string | null>(null);
  const [pathResult, setPathResult] = useState<FindPathBetweenWordsResult | null>(null);

  const handleExplore = (word: string) => {
    setLastWord(word);
    const res = expandFromWord(word, { depth: 2 });
    setExpandResult(res);
  };

  const handlePathA = (word: string) => {
    setLastWordA(word);
  };

  const handlePathB = (word: string) => {
    setLastWordB(word);
    if (!lastWordA) return;

    const res = findPathBetweenWords(lastWordA, word, {
      maxDepth: 6,
    });

    setPathResult(res);
  };

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

      {/* Bloc 1 : Exploration d'un mot */}
      <section style={{ marginBottom: '3rem' }}>
        <h2>Exploration d&apos;un mot</h2>
        <p>On appelle <code>expandFromWord</code> et on affiche le résultat brut.</p>

        <WordInput
          label="Mot à explorer :"
          placeholder="ex : desert, oasis, sable"
          onSubmit={handleExplore}
        />

        <div style={{ marginTop: '1rem' }}>
          {!lastWord && <p>Aucun mot encore cherché.</p>}

          {lastWord && (
            <p>
              Dernier mot exploré : <strong>{lastWord}</strong>
            </p>
          )}

          {expandResult && (
            <>
              <p>
                <strong>Status :</strong> {expandResult.status}
              </p>
              <pre
                style={{
                  marginTop: '1rem',
                  padding: '1rem',
                  background: '#222',
                  borderRadius: '0.5rem',
                  overflowX: 'auto',
                  maxHeight: '300px',
                }}
              >
                {JSON.stringify(expandResult, null, 2)}
              </pre>
            </>
          )}
        </div>
      </section>

      {/* Bloc 2 : Chemin entre deux mots */}
      <section>
        <h2>Chemin entre deux mots</h2>
        <p>
          On appelle <code>findPathBetweenWords</code> sur deux mots et on affiche le chemin trouvé.
        </p>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', maxWidth: 500 }}>
          <WordInput
            label="Mot de départ :"
            placeholder="ex : desert"
            onSubmit={handlePathA}
          />
          <WordInput
            label="Mot d'arrivée :"
            placeholder="ex : oasis"
            onSubmit={handlePathB}
          />
        </div>

        <div style={{ marginTop: '1rem' }}>
          {lastWordA && lastWordB && (
            <p>
              Dernier chemin demandé : <strong>{lastWordA}</strong> → <strong>{lastWordB}</strong>
            </p>
          )}

          {pathResult && (
            <>
              <p>
                <strong>Status :</strong> {pathResult.status}
              </p>
              <pre
                style={{
                  marginTop: '1rem',
                  padding: '1rem',
                  background: '#222',
                  borderRadius: '0.5rem',
                  overflowX: 'auto',
                  maxHeight: '300px',
                }}
              >
                {JSON.stringify(pathResult, null, 2)}
              </pre>
            </>
          )}
        </div>
      </section>
    </div>
  );
}

export default App;
