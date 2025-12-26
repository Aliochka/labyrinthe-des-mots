// src/components/ui/PageLayout.tsx
import React, { type ReactNode } from 'react';

export type Tab = {
  id: string;
  label: string;
  content: ReactNode;
};

interface PageLayoutProps {
  tabs: Tab[];
  activeTabId: string;
  setActiveTabId: (id: string) => void;
  activeContent?: ReactNode;  // Contenu actif fourni par le parent
}

export const PageLayout: React.FC<PageLayoutProps> = ({
  tabs,
  activeTabId,
  setActiveTabId,
  activeContent,
}) => {
  const activeTab = tabs.find((t) => t.id === activeTabId);
  // Utiliser activeContent si fourni, sinon fallback sur activeTab.content
  const content = activeContent !== undefined ? activeContent : activeTab?.content;

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

      </div>

      {/* Contenu */}
      <div style={{ flex: 1, minHeight: 0, position: 'relative' }}>
        {content}
      </div>
    </div>
  );
};
