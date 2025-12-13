// src/components/ui/ControlPanel.tsx
/**
 * Panneau d'information des contrôles pour chaque vue
 * Affiche les contrôles clavier/souris spécifiques à la vue courante
 */
import React, { useState } from 'react';

interface Control {
  keys: string;
  description: string;
}

interface ControlPanelProps {
  title?: string;
  controls: Control[];
  position?: 'top-right' | 'top-left' | 'bottom-right' | 'bottom-left';
  children?: React.ReactNode;
}

export const ControlPanel: React.FC<ControlPanelProps> = ({
  title = 'Contrôles',
  controls,
  position = 'top-left',
  children,
}) => {
  const [isCollapsed, setIsCollapsed] = useState(false);

  const positionStyles = {
    'top-right': { top: 16, right: 16 },
    'top-left': { top: 16, left: 16 },
    'bottom-right': { bottom: 16, right: 16 },
    'bottom-left': { bottom: 16, left: 16 },
  };

  return (
    <div
      style={{
        position: 'absolute',
        ...positionStyles[position],
        background: 'rgba(0, 0, 0, 0.85)',
        backdropFilter: 'blur(10px)',
        borderRadius: 8,
        padding: isCollapsed ? 12 : 16,
        minWidth: isCollapsed ? 'auto' : 240,
        zIndex: 100,
        border: '1px solid rgba(255, 255, 255, 0.1)',
        fontFamily: 'monospace',
        fontSize: 12,
        pointerEvents: 'auto',
      }}
    >
      {/* Header */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginBottom: isCollapsed ? 0 : 12,
        }}
      >
        {!isCollapsed && (
          <div style={{ fontSize: 14, fontWeight: 600, color: '#4ecdc4' }}>
            {title}
          </div>
        )}
        <button
          onClick={() => setIsCollapsed(!isCollapsed)}
          style={{
            background: 'transparent',
            border: 'none',
            color: '#999',
            cursor: 'pointer',
            fontSize: 16,
            padding: 4,
            lineHeight: 1,
          }}
          title={isCollapsed ? 'Afficher les contrôles' : 'Masquer les contrôles'}
        >
          {isCollapsed ? '❓' : '✕'}
        </button>
      </div>

      {/* Controls */}
      {!isCollapsed && controls && controls.length > 0 && (
        <>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {controls.map((control, idx) => (
              <div
                key={idx}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                  color: '#f5f5f5',
                }}
              >
                <kbd
                  style={{
                    background: 'rgba(255, 255, 255, 0.1)',
                    padding: '2px 6px',
                    borderRadius: 4,
                    border: '1px solid rgba(255, 255, 255, 0.2)',
                    fontSize: 11,
                    fontFamily: 'monospace',
                    whiteSpace: 'nowrap',
                    minWidth: 60,
                    textAlign: 'center',
                  }}
                >
                  {control.keys}
                </kbd>
                <span style={{ fontSize: 11, opacity: 0.8 }}>
                  {control.description}
                </span>
              </div>
            ))}
          </div>

          {/* Custom children */}
          {children}
        </>
      )}
    </div>
  );
};
