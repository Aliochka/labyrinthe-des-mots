// src/hooks/useMultiScaleGraph.ts
import type { MultiScaleGraph } from '../types/graph';
/**
 * DEPRECATED: This hook is replaced by useUniverseGraph.
 * Keeping for backward compatibility but functionality removed.
 */

interface UseMultiScaleGraphResult {
    graph: MultiScaleGraph | null;
    isLoading: boolean;
    error: Error | null;
}

/**
 * @deprecated Use useUniverseGraph instead
 */
export function useMultiScaleGraph(_enabled: boolean): UseMultiScaleGraphResult {
    console.warn('[useMultiScaleGraph] DEPRECATED: Use useUniverseGraph instead');

    // Return empty state
    return {
        graph: null,
        isLoading: false,
        error: new Error('useMultiScaleGraph is deprecated. Use useUniverseGraph instead.')
    };
}
