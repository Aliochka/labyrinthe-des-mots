import React from 'react';
import type { WordNode } from '../../types/game';

interface NodeInfoPanelProps {
  node: WordNode | null;
  onClose: () => void;
}

/**
 * Information panel displayed when a node is selected
 * Matches Map3D's panel style (glassmorphism, bottom-right position)
 */
export const NodeInfoPanel: React.FC<NodeInfoPanelProps> = ({ node, onClose }) => {
  if (!node) return null;

  // Check if this is a galaxy center (virtual node)
  const isGalaxyCenter = node.id.startsWith('galaxy-');
  const displayName = node.word || node.id;

  return (
    <div
      style={{
        position: 'absolute',
        bottom: '20px',
        right: '20px',
        background: 'rgba(15, 15, 25, 0.92)',
        backdropFilter: 'blur(10px)',
        WebkitBackdropFilter: 'blur(10px)',
        border: '1px solid rgba(255, 255, 255, 0.15)',
        borderRadius: '8px',
        padding: '16px 20px',
        minWidth: '250px',
        maxWidth: '350px',
        boxShadow: '0 8px 32px rgba(0, 0, 0, 0.4)',
        zIndex: 1000,
        color: '#f5f5f5',
        fontSize: '14px',
        fontFamily: 'system-ui, -apple-system, sans-serif',
      }}
    >
      {/* Close button */}
      <button
        onClick={onClose}
        style={{
          position: 'absolute',
          top: '12px',
          right: '12px',
          background: 'transparent',
          border: 'none',
          color: 'rgba(255, 255, 255, 0.6)',
          cursor: 'pointer',
          fontSize: '20px',
          lineHeight: '20px',
          padding: '4px',
          transition: 'color 0.2s',
        }}
        onMouseEnter={(e) => (e.currentTarget.style.color = 'rgba(255, 255, 255, 1)')}
        onMouseLeave={(e) => (e.currentTarget.style.color = 'rgba(255, 255, 255, 0.6)')}
      >
        ×
      </button>

      {/* Node name/label */}
      <div
        style={{
          color: '#4ecdc4', // Cyan color for consistency
          fontSize: '16px',
          fontWeight: '600',
          marginBottom: '8px',
          marginRight: '24px',
          wordBreak: 'break-word',
        }}
      >
        {displayName}
      </div>

      {/* Node ID */}
      <div
        style={{
          color: 'rgba(255, 255, 255, 0.7)',
          fontSize: '12px',
          marginBottom: isGalaxyCenter ? '8px' : '0',
        }}
      >
        ID: {node.id}
      </div>

      {/* Galaxy center badge */}
      {isGalaxyCenter && (
        <div
          style={{
            display: 'inline-block',
            background: 'rgba(255, 210, 150, 0.15)',
            border: '1px solid rgba(255, 210, 150, 0.3)',
            borderRadius: '4px',
            padding: '4px 8px',
            fontSize: '11px',
            color: '#ffd296', // Orange color from Map3D
            fontWeight: '500',
            marginTop: '4px',
          }}
        >
          Centre de galaxie
        </div>
      )}
    </div>
  );
};
