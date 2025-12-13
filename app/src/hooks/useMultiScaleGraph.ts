// src/hooks/useMultiScaleGraph.ts
import { useEffect, useState } from 'react';
import { useAppStore } from '../store/appStore';
import type { MultiScaleGraph } from '../types/graph';
import type { LayoutType } from '../services/LemmaDataService';

// Map entre layout et l'URL du graphe correspondant
const GRAPH_URLS: Record<LayoutType, string> = {
    deepwalk: '/multiscale-deepwalk.json',
    random: '/multiscale-random.json',
    noise: '/multiscale-noise.json',
};

interface UseMultiScaleGraphResult {
    graph: MultiScaleGraph | null;
    isLoading: boolean;
    error: Error | null;
}

/**
 * Charge le graphe multi-échelles en fonction du layout global (deepwalk/random/noise).
 * Le paramètre `enabled` permet de ne pas lancer le fetch quand on est en vue "navigation".
 */
export function useMultiScaleGraph(enabled: boolean): UseMultiScaleGraphResult {
    const layout = useAppStore((s) => s.layout);

    const [graph, setGraph] = useState<MultiScaleGraph | null>(null);
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<Error | null>(null);

    useEffect(() => {
        if (!enabled) return;

        const controller = new AbortController();
        const url = GRAPH_URLS[layout];

        const loadGraph = async () => {
            try {
                setIsLoading(true);
                setError(null);

                console.log(`[useMultiScaleGraph] Chargement de ${url}...`);

                const res = await fetch(url, { signal: controller.signal });
                if (!res.ok) {
                    throw new Error(`HTTP ${res.status} lors du chargement de ${url}`);
                }

                const json = (await res.json()) as MultiScaleGraph;
                setGraph(json);

                console.log(`[useMultiScaleGraph] ✓ Graphe ${layout} chargé (${json.levels.length} niveaux)`);
            } catch (e: any) {
                if (e.name === 'AbortError') return;
                console.error('Erreur chargement multiscale graph', e);
                setError(e);
            } finally {
                setIsLoading(false);
            }
        };

        loadGraph();

        return () => {
            controller.abort();
        };
    }, [enabled, layout]);

    return { graph, isLoading, error };
}
