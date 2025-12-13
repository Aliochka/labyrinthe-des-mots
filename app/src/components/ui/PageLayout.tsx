// src/components/ui/PageLayout.tsx
import React, { type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { useAppStore } from '../../store/appStore';
import { Params } from './Params';

export type Tab = {
  id: string;
  label: string;
  content: ReactNode;
};

interface PageLayoutProps {
  tabs: Tab[];
  activeTabId: string;
  setActiveTabId: (id: string) => void;
  modeSwitchLink?: {
    to: string;
    label: string;
    color: string;
  };
}

export const PageLayout: React.FC<PageLayoutProps> = ({
  tabs,
  activeTabId,
  setActiveTabId,
  modeSwitchLink,
}) => {
  const toggleSettings = useAppStore((s) => s.toggleSettings);

  const activeTab = tabs.find((t) => t.id === activeTabId);

  return (
    <div
      style={{
        width: '100%',
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        background: '#111',
        color: '#f5f5f5',
      }}
    >
      {/* Barre d'onglets */}
      <div
        style={{
          height: 48,
          display: 'flex',
          alignItems: 'center',
          gap: 4,
          padding: '0 16px',
          borderBottom: '1px solid rgba(255, 255, 255, 0.1)',
          background: 'rgba(0, 0, 0, 0.85)',
          backdropFilter: 'blur(8px)',
        }}
      >
        {/* Onglets */}
        {tabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTabId(tab.id)}
            style={{
              padding: '6px 12px',
              fontSize: 13,
              border: 'none',
              borderRadius: 6,
              background:
                activeTabId === tab.id
                  ? 'rgba(78, 205, 196, 0.15)'
                  : 'transparent',
              color: activeTabId === tab.id ? '#4ecdc4' : '#f5f5f5',
              cursor: 'pointer',
            }}
          >
            {tab.label}
          </button>
        ))}

        {/* Séparateur */}
        <div style={{ flex: 1 }} />

        {/* Lien vers l'autre mode */}
        {modeSwitchLink && (
          <Link
            to={modeSwitchLink.to}
            style={{
              padding: '6px 12px',
              fontSize: 13,
              border: `1px solid ${modeSwitchLink.color}40`,
              borderRadius: 6,
              background: 'transparent',
              color: modeSwitchLink.color,
              textDecoration: 'none',
              marginRight: 8,
              transition: 'all 0.2s',
            }}
          >
            {modeSwitchLink.label}
          </Link>
        )}

        {/* Bouton paramètres */}
        <button
          onClick={toggleSettings}
          style={{
            padding: '6px 12px',
            fontSize: 13,
            border: 'none',
            borderRadius: 6,
            background: 'transparent',
            color: '#f5f5f5',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: 6,
          }}
          title="Paramètres"
        >
          ⚙️ Paramètres
        </button>
      </div>

      {/* Contenu */}
      <div style={{ flex: 1, minHeight: 0, position: 'relative' }}>
        {activeTab?.content}
      </div>

      {/* Params Panel */}
      <Params />
    </div>
  );
};
