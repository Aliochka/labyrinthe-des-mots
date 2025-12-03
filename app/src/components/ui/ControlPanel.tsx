// src/components/ui/ControlPanel.tsx
import { useState } from 'react';
import { WordInput } from './WordInput';

interface ControlPanelProps {
  firstWord: string | null;
  secondWord: string | null;
  helperText: string;
  isLoading: boolean;
  wordPath: string[];
  onFirstWordSubmit: (word: string) => void;
  onSecondWordSubmit: (word: string) => void;
  onResetPath?: () => void;
}

export function ControlPanel({
  firstWord,
  secondWord,
  helperText,
  isLoading,
  wordPath,
  onFirstWordSubmit,
  onSecondWordSubmit,
  onResetPath,
}: ControlPanelProps) {
  const [isCollapsed, setIsCollapsed] = useState(false);

  return (
    <div
      style={{
        position: 'fixed',
        top: '20px',
        right: '20px',
        zIndex: 1000,
        background: 'rgba(24, 24, 24, 0.95)',
        backdropFilter: 'blur(10px)',
        borderRadius: '12px',
        border: '1px solid rgba(255, 255, 255, 0.1)',
        boxShadow: '0 8px 32px rgba(0, 0, 0, 0.3)',
        transition: 'all 0.3s ease',
        minWidth: isCollapsed ? '60px' : '380px',
        maxWidth: '90vw',
      }}
    >
      {/* Header avec toggle */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '12px 16px',
          borderBottom: isCollapsed ? 'none' : '1px solid rgba(255, 255, 255, 0.1)',
        }}
      >
        {!isCollapsed && (
          <h2
            style={{
              margin: 0,
              fontSize: '18px',
              fontWeight: '600',
              color: '#f5f5f5',
              background: 'linear-gradient(135deg, #60a5fa, #a78bfa)',
              backgroundClip: 'text',
              WebkitBackgroundClip: 'text',
              WebkitTextFillColor: 'transparent',
            }}
          >
            Labyrinthe des mots
          </h2>
        )}

        <button
          onClick={() => setIsCollapsed(!isCollapsed)}
          style={{
            background: 'none',
            border: 'none',
            color: '#888',
            cursor: 'pointer',
            fontSize: '18px',
            padding: '4px',
            borderRadius: '4px',
            transition: 'color 0.2s',
            marginLeft: isCollapsed ? 0 : '8px',
          }}
          onMouseEnter={(e) => (e.target.style.color = '#f5f5f5')}
          onMouseLeave={(e) => (e.target.style.color = '#888')}
        >
          {isCollapsed ? '⚙️' : '−'}
        </button>
      </div>

      {/* Contenu principal */}
      {!isCollapsed && (
        <div style={{ padding: '16px' }}>
          {/* Instructions */}
          <p
            style={{
              margin: '0 0 16px 0',
              fontSize: '14px',
              color: '#ccc',
              lineHeight: '1.4',
            }}
          >
            Explore les connexions sémantiques entre les mots français
          </p>

          {/* Inputs compacts */}
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              gap: '12px',
              marginBottom: '16px',
            }}
          >
            <WordInput
              label="Premier mot"
              placeholder="ex: animal"
              onSubmit={onFirstWordSubmit}
              compact
            />
            <WordInput
              label="Second mot"
              placeholder="ex: chat"
              onSubmit={onSecondWordSubmit}
              disabled={!firstWord || isLoading}
              compact
            />
          </div>

          {/* Statut */}
          <div
            style={{
              fontSize: '13px',
              color: helperText.includes('❌') ? '#ef4444' :
                     helperText.includes('⚠️') ? '#f59e0b' :
                     helperText.includes('🔄') ? '#3b82f6' : '#888',
              lineHeight: '1.3',
              minHeight: '32px',
              display: 'flex',
              alignItems: 'center',
            }}
          >
            {helperText}
          </div>

          {/* Badges d'état */}
          {(firstWord || secondWord) && (
            <div
              style={{
                display: 'flex',
                gap: '8px',
                marginTop: '12px',
                flexWrap: 'wrap',
              }}
            >
              {firstWord && (
                <span
                  style={{
                    background: 'rgba(59, 130, 246, 0.2)',
                    color: '#60a5fa',
                    padding: '4px 8px',
                    borderRadius: '6px',
                    fontSize: '12px',
                    border: '1px solid rgba(59, 130, 246, 0.3)',
                  }}
                >
                  {firstWord}
                </span>
              )}
              {secondWord && (
                <span
                  style={{
                    background: 'rgba(167, 139, 250, 0.2)',
                    color: '#a78bfa',
                    padding: '4px 8px',
                    borderRadius: '6px',
                    fontSize: '12px',
                    border: '1px solid rgba(167, 139, 250, 0.3)',
                  }}
                >
                  {secondWord}
                </span>
              )}
            </div>
          )}

          {/* Chemin de navigation */}
          {wordPath.length > 0 && (
            <div style={{ marginTop: '12px' }}>
              <div style={{
                fontSize: '12px',
                color: '#888',
                marginBottom: '6px'
              }}>
                Chemin parcouru :
              </div>
              <div style={{
                display: 'flex',
                flexWrap: 'wrap',
                gap: '4px',
                alignItems: 'center',
              }}>
                {wordPath.map((word, index) => (
                  <span key={index}>
                    <span style={{
                      background: 'rgba(34, 197, 94, 0.2)',
                      color: '#22c55e',
                      padding: '2px 6px',
                      borderRadius: '4px',
                      fontSize: '11px',
                      border: '1px solid rgba(34, 197, 94, 0.3)',
                    }}>
                      {word}
                    </span>
                    {index < wordPath.length - 1 && (
                      <span style={{ color: '#666', margin: '0 4px' }}>→</span>
                    )}
                  </span>
                ))}
              </div>

              {/* Bouton pour réinitialiser le chemin */}
              {onResetPath && (
                <button
                  onClick={onResetPath}
                  style={{
                    marginTop: '8px',
                    padding: '4px 8px',
                    borderRadius: '4px',
                    border: '1px solid rgba(239, 68, 68, 0.3)',
                    background: 'rgba(239, 68, 68, 0.1)',
                    color: '#ef4444',
                    fontSize: '11px',
                    cursor: 'pointer',
                    transition: 'all 0.2s',
                  }}
                  onMouseEnter={(e) => {
                    e.target.style.background = 'rgba(239, 68, 68, 0.2)';
                  }}
                  onMouseLeave={(e) => {
                    e.target.style.background = 'rgba(239, 68, 68, 0.1)';
                  }}
                >
                  🗑️ Réinitialiser
                </button>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}