// src/App.tsx
import React, { useEffect, useState } from 'react';
import './App.css';

import { SimpleLemmaGraph } from './components/lemma/SimpleLemmaGraph';
import type { LemmaNode } from './types/lemma';

// Nouveau composant moderne utilisant le système lemma avec design plein écran
function App() {
  const [isInitialized, setIsInitialized] = useState(false);
  const [selectedLemma, setSelectedLemma] = useState<LemmaNode | null>(null);
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [currentQuery, setCurrentQuery] = useState('');
  const [graphKey, setGraphKey] = useState(0); // Pour forcer le re-render du graphe

  // Mots aléatoires pour démarrer
  const randomWords = [
    'entité',
    'chat',
    'animal',
    'maison',
    'vie',
    'temps',
    'eau',
    'feu',
    'terre',
    'air',
    'joie',
    'tristesse',
    'amour',
    'paix',
    'liberté'
  ];

  useEffect(() => {
    const initializeApp = async () => {
      try {
        console.log('Initialisation ModernLemmaApp...');

        // Commencer avec un mot aléatoire
        const randomWord = randomWords[Math.floor(Math.random() * randomWords.length)];
        setCurrentQuery(randomWord);
        setSearchQuery(randomWord);

        setIsInitialized(true);
      } catch (error) {
        console.error('Erreur initialisation ModernLemmaApp:', error);
      }
    };

    initializeApp();
  }, []);

  const handleLemmaClick = (lemma: LemmaNode) => {
    setSelectedLemma(lemma);
    console.log('Lemme sélectionné:', lemma);
  };

  const handleSearch = () => {
    if (searchQuery.trim()) {
      setCurrentQuery(searchQuery.trim());
      setGraphKey(prev => prev + 1); // Force re-render
    }
  };

  const handleRandom = () => {
    const randomWord = randomWords[Math.floor(Math.random() * randomWords.length)];
    setCurrentQuery(randomWord);
    setSearchQuery(randomWord);
    setGraphKey(prev => prev + 1); // Force re-render
  };

  if (!isInitialized) {
    return (
      <div
        style={{
          width: '100vw',
          height: '100vh',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: '#111',
          color: '#f5f5f5',
          fontFamily: 'system-ui, sans-serif'
        }}
      >
        <div>Initialisation du système lemme...</div>
      </div>
    );
  }

  return (
    <div
      style={{
        width: '100vw',
        height: '100vh',
        margin: 0,
        padding: 0,
        fontFamily: 'system-ui, sans-serif',
        background: '#111',
        color: '#f5f5f5',
        position: 'relative',
        overflow: 'hidden'
      }}
    >
      {/* Panneau de contrôle flottant adapté pour lemmes */}
      <div
        style={{
          position: 'absolute',
          top: 20,
          right: 20,
          background: 'rgba(0, 0, 0, 0.9)',
          backdropFilter: 'blur(10px)',
          borderRadius: '12px',
          padding: isCollapsed ? '12px' : '20px',
          minWidth: isCollapsed ? 'auto' : '320px',
          zIndex: 1000,
          border: '1px solid rgba(255, 255, 255, 0.1)',
          boxShadow: '0 8px 32px rgba(0, 0, 0, 0.3)',
          transition: 'all 0.3s ease'
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <h2
            style={{
              margin: '0',
              fontSize: '18px',
              fontWeight: 600,
              display: isCollapsed ? 'none' : 'block'
            }}
          >
            🧠 Atlas Sémantique (lemmes)
          </h2>
          <button
            onClick={() => setIsCollapsed(!isCollapsed)}
            style={{
              background: 'rgba(255, 255, 255, 0.1)',
              border: 'none',
              borderRadius: '6px',
              color: '#f5f5f5',
              padding: '8px 12px',
              cursor: 'pointer',
              fontSize: '14px',
              marginLeft: isCollapsed ? '0' : '10px'
            }}
          >
            {isCollapsed ? '📖' : '📕'}
          </button>
        </div>

        {!isCollapsed && (
          <>
            <p
              style={{
                margin: '12px 0 16px 0',
                fontSize: '14px',
                opacity: 0.8,
                lineHeight: 1.4
              }}
            >
              Explorez l’atlas sémantique centré sur les lemmes du WordNet français.
            </p>

            {/* Barre de recherche */}
            <div style={{ marginBottom: '16px' }}>
              <div style={{ display: 'flex', gap: '8px', marginBottom: '8px' }}>
                <input
                  type="text"
                  placeholder="Rechercher un mot..."
                  value={searchQuery}
                  onChange={e => setSearchQuery(e.target.value)}
                  onKeyPress={e => e.key === 'Enter' && handleSearch()}
                  style={{
                    flex: 1,
                    padding: '8px 12px',
                    borderRadius: '6px',
                    border: '1px solid rgba(255, 255, 255, 0.2)',
                    background: 'rgba(255, 255, 255, 0.1)',
                    color: '#f5f5f5',
                    fontSize: '14px',
                    outline: 'none'
                  }}
                />
                <button
                  onClick={handleSearch}
                  style={{
                    background: '#4ecdc4',
                    border: 'none',
                    borderRadius: '6px',
                    color: '#111',
                    padding: '8px 16px',
                    cursor: 'pointer',
                    fontSize: '14px',
                    fontWeight: '600'
                  }}
                >
                  🔍
                </button>
              </div>
              <button
                onClick={handleRandom}
                style={{
                  width: '100%',
                  background: '#ff6b6b',
                  border: 'none',
                  borderRadius: '6px',
                  color: '#fff',
                  padding: '10px',
                  cursor: 'pointer',
                  fontSize: '14px',
                  fontWeight: '600'
                }}
              >
                🎲 Mot aléatoire
              </button>
            </div>

            {/* Mot actuel */}
            {currentQuery && (
              <div
                style={{
                  background: 'rgba(76, 205, 196, 0.2)',
                  borderRadius: '8px',
                  padding: '12px',
                  marginBottom: '16px'
                }}
              >
                <div style={{ fontSize: '12px', opacity: 0.7 }}>Mot exploré :</div>
                <div style={{ fontSize: '16px', fontWeight: 600, marginTop: '4px' }}>
                  {currentQuery}
                </div>
              </div>
            )}

            {/* Lemme sélectionné */}
            {selectedLemma && (
              <div
                style={{
                  background: 'rgba(255, 255, 255, 0.1)',
                  borderRadius: '8px',
                  padding: '12px'
                }}
              >
                <div style={{ fontSize: '12px', opacity: 0.7 }}>Lemme sélectionné :</div>
                <div style={{ fontSize: '14px', fontWeight: 500, marginTop: '4px' }}>
                  {selectedLemma.lemma}
                </div>
                <div
                  style={{
                    fontSize: '11px',
                    opacity: 0.6,
                    marginTop: '6px',
                    fontStyle: 'italic'
                  }}
                >
                  💡 Appuyez sur ESPACE pour explorer ce lemme dans l’atlas
                </div>
              </div>
            )}

            {/* Instructions */}
            <div
              style={{
                background: 'rgba(255, 255, 255, 0.05)',
                borderRadius: '6px',
                padding: '8px',
                fontSize: '11px',
                opacity: 0.7,
                lineHeight: 1.3
              }}
            >
              🖱️ Cliquez sur un mot pour le sélectionner
              <br />
              ⌨️ ESPACE pour explorer le mot sélectionné
              <br />
              🌐 Souris pour naviguer en 3D
            </div>
          </>
        )}
      </div>

      {/* Graphe lemma plein écran */}
      <SimpleLemmaGraph
        key={graphKey}
        width={window.innerWidth}
        height={window.innerHeight}
        initialQuery={currentQuery}
        onLemmaClick={handleLemmaClick}
      />
    </div>
  );
}

export default App;
