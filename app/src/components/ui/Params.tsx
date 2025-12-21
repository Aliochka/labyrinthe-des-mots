// src/components/ui/Params.tsx
/**
 * Panneau de paramètres globaux :
 * - Mode (play/study) avec navigation
 */
import React from 'react';
import { useNavigate } from 'react-router-dom';
import { useAppStore } from '../../store/appStore';

export const Params: React.FC = () => {
  const navigate = useNavigate();
  const isOpen = useAppStore((s) => s.isSettingsOpen);
  const toggleSettings = useAppStore((s) => s.toggleSettings);
  const mode = useAppStore((s) => s.mode);
  const setMode = useAppStore((s) => s.setMode);

  const handleModeChange = (newMode: 'play' | 'study') => {
    if (newMode === mode) return;
    setMode(newMode);
    navigate(newMode === 'play' ? '/game' : '/study');
  };

  if (!isOpen) return null;

  return (
    <>
      {/* Backdrop */}
      <div
        onClick={toggleSettings}
        style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          background: 'rgba(0, 0, 0, 0.5)',
          backdropFilter: 'blur(4px)',
          zIndex: 999,
        }}
      />

      {/* Panel */}
      <div
        style={{
          position: 'fixed',
          top: '50%',
          left: '50%',
          transform: 'translate(-50%, -50%)',
          width: 380,
          maxWidth: '90vw',
          background: 'rgba(17, 17, 17, 0.95)',
          border: '1px solid rgba(255, 255, 255, 0.1)',
          borderRadius: 12,
          padding: 24,
          color: '#f5f5f5',
          fontFamily: 'system-ui, -apple-system, sans-serif',
          zIndex: 1000,
          boxShadow: '0 8px 32px rgba(0, 0, 0, 0.4)',
        }}
      >
        {/* Header */}
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            marginBottom: 24,
          }}
        >
          <h2 style={{ margin: 0, fontSize: 20, fontWeight: 600 }}>
            Paramètres
          </h2>
          <button
            onClick={toggleSettings}
            style={{
              background: 'none',
              border: 'none',
              color: '#999',
              fontSize: 24,
              cursor: 'pointer',
              padding: 0,
              lineHeight: 1,
            }}
          >
            ×
          </button>
        </div>

        {/* Settings */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
          {/* Mode */}
          <div>
            <label
              style={{
                display: 'block',
                fontSize: 14,
                fontWeight: 500,
                marginBottom: 8,
                color: '#4ecdc4',
              }}
            >
              Mode
            </label>
            <div style={{ display: 'flex', gap: 8 }}>
              <button
                onClick={() => handleModeChange('study')}
                style={{
                  flex: 1,
                  padding: '10px 16px',
                  fontSize: 14,
                  border: mode === 'study'
                    ? '2px solid #4ecdc4'
                    : '1px solid rgba(255, 255, 255, 0.2)',
                  borderRadius: 6,
                  background: mode === 'study'
                    ? 'rgba(78, 205, 196, 0.15)'
                    : 'rgba(0, 0, 0, 0.5)',
                  color: mode === 'study' ? '#4ecdc4' : '#f5f5f5',
                  cursor: 'pointer',
                  fontWeight: mode === 'study' ? 600 : 400,
                }}
              >
                📚 Study
              </button>
              <button
                onClick={() => handleModeChange('play')}
                style={{
                  flex: 1,
                  padding: '10px 16px',
                  fontSize: 14,
                  border: mode === 'play'
                    ? '2px solid #4ecdc4'
                    : '1px solid rgba(255, 255, 255, 0.2)',
                  borderRadius: 6,
                  background: mode === 'play'
                    ? 'rgba(78, 205, 196, 0.15)'
                    : 'rgba(0, 0, 0, 0.5)',
                  color: mode === 'play' ? '#4ecdc4' : '#f5f5f5',
                  cursor: 'pointer',
                  fontWeight: mode === 'play' ? 600 : 400,
                }}
              >
                🎮 Play
              </button>
            </div>
          </div>

          {/* Info */}
          <div
            style={{
              padding: 12,
              background: 'rgba(78, 205, 196, 0.1)',
              border: '1px solid rgba(78, 205, 196, 0.2)',
              borderRadius: 6,
              fontSize: 12,
              color: '#ccc',
              lineHeight: 1.5,
            }}
          >
            💡 Les changements nécessitent de recharger les données
          </div>
        </div>
      </div>
    </>
  );
};
