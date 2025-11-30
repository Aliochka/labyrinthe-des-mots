// src/App.tsx
import { useState } from 'react';
import './App.css';

import { WordInput } from './components/ui/WordInput';
import { expandFromWord } from './semantic-api/words';
import type { ExpandFromWordResult } from './types/api';

function App() {
  const [lastWord, setLastWord] = useState<string | null>(null);
  const [result, setResult] = useState<ExpandFromWordResult | null>(null);

  const handleSearch = (word: string) => {
    setLastWord(word);

    // On appelle notre fonction "métier"
    const res = expandFromWord(word, {
      depth: 2,
    });

    setResult(res);
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

      <p style={{ marginBottom: '1rem' }}>
        Tape un mot et on appellera <code>expandFromWord</code> côté logique.
      </p>

      <WordInput
        label="Mot de départ :"
        placeholder="ex : désert"
        onSubmit={handleSearch}
      />

      <div style={{ marginTop: '2rem' }}>
        <h2>Résultat brut</h2>

        {!lastWord && <p>Aucun mot encore cherché.</p>}

        {lastWord && (
          <p>
            Dernier mot cherché : <strong>{lastWord}</strong>
          </p>
        )}

        {result && (
          <>
            <p>
              <strong>Status :</strong> {result.status}
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
              {JSON.stringify(result, null, 2)}
            </pre>
          </>
        )}
      </div>
    </div>
  );
}

export default App;
