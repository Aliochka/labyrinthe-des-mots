import { useEffect, useState } from 'react';
import { Vector3 } from 'three';
import { lemmaDataService, type LayoutType } from '../services/LemmaDataService';
import type { WordNode } from '../types/game';

const POSITION_SCALE = 5; // Scale factor for positions
const MAX_RELATIONS = 100; // For normalization

export interface LemmaGraphData {
  nodes: WordNode[];
  isLoading: boolean;
  error: string | null;
}

export function useLemmaGraph(layout: LayoutType = 'deepwalk'): LemmaGraphData {
  const [data, setData] = useState<LemmaGraphData>({
    nodes: [],
    isLoading: true,
    error: null,
  });

  useEffect(() => {
    const loadData = async () => {
      try {
        console.log(`[useLemmaGraph] Initializing with layout: ${layout}...`);
        await lemmaDataService.initialize(layout);

        // Get all lemmas
        const allLemmas = lemmaDataService.getAllLemmas();
        console.log(`[useLemmaGraph] Loaded ${allLemmas.length} lemmas`);

        // Convert to WordNodes for the game
        const nodes: WordNode[] = allLemmas.map((lemma) => ({
          id: lemma.lemma,
          word: lemma.lemma,
          position: new Vector3(
            lemma.x * POSITION_SCALE,
            lemma.y * POSITION_SCALE,
            lemma.z * POSITION_SCALE
          ),
          importance: Math.min(lemma.relationCount / MAX_RELATIONS, 1),
          senseCount: lemma.senseCount,
          relationCount: lemma.relationCount,
          synsets: lemma.synsets,
        }));

        setData({
          nodes,
          isLoading: false,
          error: null,
        });

        console.log('[useLemmaGraph] Graph loaded successfully');
      } catch (err: any) {
        console.error('[useLemmaGraph] Error loading graph:', err);
        setData({
          nodes: [],
          isLoading: false,
          error: err.message || 'Failed to load graph',
        });
      }
    };

    loadData();
  }, [layout]);

  return data;
}
