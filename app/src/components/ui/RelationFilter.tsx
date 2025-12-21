// src/components/ui/RelationFilter.tsx
/**
 * Composant de filtrage des types de relations
 * Affiche des checkboxes pour activer/désactiver les types de relations
 */

import React from 'react';
import { RELATION_TYPES } from '../../constants/relationTypes';

interface RelationFilterProps {
  enabledTypes: Set<string>;
  onToggle: (relationType: string) => void;
  onReset: () => void;
}

export const RelationFilter: React.FC<RelationFilterProps> = ({
  enabledTypes,
  onToggle,
  onReset,
}) => {
  return (
    <div style={{ marginTop: '16px' }}>
      {/* En-tête avec titre et bouton reset */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginBottom: '8px',
        }}
      >
        <span
          style={{
            fontSize: '13px',
            color: '#f5f5f5',
            opacity: 0.7,
          }}
        >
          Types de relations :
        </span>
        <button
          onClick={onReset}
          style={{
            background: 'transparent',
            border: '1px solid rgba(255, 255, 255, 0.2)',
            color: '#999',
            cursor: 'pointer',
            fontSize: '11px',
            padding: '2px 6px',
            borderRadius: '4px',
          }}
          title="Réinitialiser aux valeurs par défaut"
        >
          Reset
        </button>
      </div>

      {/* Liste des checkboxes */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
        {RELATION_TYPES.map((relationType) => (
          <label
            key={relationType.id}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              fontSize: '12px',
              color: '#f5f5f5',
              cursor: 'pointer',
            }}
            title={relationType.description}
          >
            <input
              type="checkbox"
              checked={enabledTypes.has(relationType.id)}
              onChange={() => onToggle(relationType.id)}
              style={{
                cursor: 'pointer',
                accentColor: relationType.color,
              }}
            />
            <span
              style={{
                width: '8px',
                height: '8px',
                borderRadius: '2px',
                backgroundColor: relationType.color,
                opacity: enabledTypes.has(relationType.id) ? 1 : 0.3,
              }}
            />
            <span
              style={{
                opacity: enabledTypes.has(relationType.id) ? 1 : 0.5,
              }}
            >
              {relationType.label}
            </span>
          </label>
        ))}
      </div>

      {/* Compteur de types activés */}
      <div
        style={{
          marginTop: '8px',
          fontSize: '11px',
          color: '#999',
          textAlign: 'right',
        }}
      >
        {enabledTypes.size} / {RELATION_TYPES.length} activés
      </div>
    </div>
  );
};
