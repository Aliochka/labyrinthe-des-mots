// src/hooks/useUniverseGraph.ts
import { useEffect, useState } from 'react';
import type {
  UniverseData,
  UniverseGraphData,
  GraphNode,
  GraphLink,
  StarNode,
} from '../types/graph';

const UNIVERSE_URL = '/universe.json';
const LEMMA_GRAPH_URL = '/lemma-graph+etym.json';

interface UseUniverseGraphResult {
  graphData: UniverseGraphData | null;
  isLoading: boolean;
  error: Error | null;
}

/**
 * Charge universe.json + lemma-graph.json une seule fois
 * et construit les index en mémoire pour performance O(1)
 *
 * @param enabled - Si false, ne charge pas les données
 */
export function useUniverseGraph(enabled: boolean = true): UseUniverseGraphResult {
  const [graphData, setGraphData] = useState<UniverseGraphData | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    if (!enabled) return;

    const controller = new AbortController();

    const loadGraph = async () => {
      try {
        setIsLoading(true);
        setError(null);

        console.log('[useUniverseGraph] Chargement de universe.json + lemma-graph.json...');

        // 1. Charger les deux fichiers en parallèle
        const [universeRes, lemmaGraphRes] = await Promise.all([
          fetch(UNIVERSE_URL, { signal: controller.signal }),
          fetch(LEMMA_GRAPH_URL, { signal: controller.signal })
        ]);

        if (!universeRes.ok) {
          throw new Error(`HTTP ${universeRes.status} lors du chargement de universe.json`);
        }
        if (!lemmaGraphRes.ok) {
          throw new Error(`HTTP ${lemmaGraphRes.status} lors du chargement de lemma-graph.json`);
        }

        const universe: UniverseData = await universeRes.json();
        const lemmaGraph = await lemmaGraphRes.json();

        console.log(`[useUniverseGraph] ✓ Fichiers chargés (${universe.meta.galaxies} galaxies, ${universe.meta.stars} stars)`);

        // 2. Construire les index en mémoire (UNE SEULE FOIS)
        const data = buildUniverseGraphData(universe, lemmaGraph);

        setGraphData(data);

        console.log('[useUniverseGraph] ✓ Index construits et prêts');
      } catch (e: any) {
        if (e.name === 'AbortError') return;
        console.error('[useUniverseGraph] Erreur chargement:', e);
        setError(e);
      } finally {
        setIsLoading(false);
      }
    };

    loadGraph();

    return () => {
      controller.abort();
    };
  }, [enabled]);

  return { graphData, isLoading, error };
}

/**
 * Construit la structure de données indexée une seule fois
 * Évite de reconstruire les mêmes choses dans Map2D/Map3D
 */
function buildUniverseGraphData(
  universe: UniverseData,
  lemmaGraph: any
): UniverseGraphData {
  // ===== INDEX 1 : galaxyMembersMap =====
  // Construit une Map galaxyId -> [starId, starId, ...]
  const galaxyMembersMap = new Map<string, string[]>();

  // Initialiser avec des tableaux vides pour toutes les galaxies
  universe.galaxies.forEach(g => galaxyMembersMap.set(g.id, []));

  // Remplir avec les stars qui appartiennent à une vraie galaxie (pas void)
  universe.stars.forEach(star => {
    // Skip void stars for galaxy membership (but keep them in starIndex)
    if (!star.galaxy || star.galaxy === 'void') {
      return;
    }

    const members = galaxyMembersMap.get(star.galaxy);
    if (members) {
      members.push(star.id);
    }
  });

  // ===== INDEX 2 : starIndex (accès O(1)) =====
  // Index ALL stars (including void) for position lookups
  const starIndex = new Map<string, StarNode>();
  universe.stars.forEach(star => {
    // Only validate data integrity, no filtering on galaxy
    if (
      typeof star?.id === 'string' &&
      Number.isFinite(star?.x) &&
      Number.isFinite(star?.y) &&
      Number.isFinite(star?.z)
    ) {
      starIndex.set(star.id, star);
    }
  });

  // ===== GALAXY NODES =====
  const galaxyNodes: GraphNode[] = universe.galaxies.map(g => ({
    id: g.id,
    name: g.name,
    x: g.x,
    y: g.y,
    z: g.z,
    size: g.size,
    // Conserver les champs spécifiques pour GalaxyDataService
    ...(g as any), // slug, confidence, etc.
  }));

  // ===== STAR NODES =====
  // Include ALL valid stars (even void ones) for position data
  // Filtering (void, visibility, etc.) happens at UI/renderer level
  const starNodes: GraphNode[] = universe.stars
    .filter(s =>
      typeof s?.id === 'string' &&
      Number.isFinite(s?.x) &&
      Number.isFinite(s?.y) &&
      Number.isFinite(s?.z)
    )
    .map(s => ({
      id: s.id,
      name: s.id,
      x: s.x,
      y: s.y,
      z: s.z,
    }));

  // ===== STAR EDGES (depuis lemma-graph.json) =====
  const starEdges: GraphLink[] = lemmaGraph.edges.map((edge: any) => ({
    source: edge.source,
    target: edge.target,
    relType: `w${edge.weight}`,
    relationTypes: edge.relationTypes || []  // Pour filtrage relations
  }));

  // ===== GALAXY EDGES (agrégés depuis star edges) =====
  const galaxyEdges = buildGalaxyEdges(starEdges, starIndex);

  // Log pour vérification
  console.log(`[buildUniverseGraphData] starIndex size: ${starIndex.size}`);
  console.log(`[buildUniverseGraphData] Test a_la_fois:`, starIndex.get('a_la_fois'));
  console.log(`[buildUniverseGraphData] starNodes: ${starNodes.length}, galaxyNodes: ${galaxyNodes.length}`);
  console.log(`[buildUniverseGraphData] star backbone: ${universe.bundles?.star?.backbone?.length ?? 0} edges`);

  return {
    galaxies: {
      nodes: galaxyNodes,
      links: galaxyEdges
    },
    stars: {
      nodes: starNodes,
      links: starEdges
    },
    bundles: universe.bundles,  // Propager les bundles depuis universe.json
    galaxyMembersMap,
    starIndex
  };
}

/**
 * Agrège les liens entre stars en liens entre galaxies
 * Un lien galaxy-galaxy existe si au moins MIN_WEIGHT stars sont connectées entre elles
 */
function buildGalaxyEdges(
  starEdges: GraphLink[],
  starIndex: Map<string, StarNode>
): GraphLink[] {
  const linkCounts = new Map<string, {
    count: number;
    relationTypes: Set<string>;
  }>();

  // Compter les liens inter-galaxies
  starEdges.forEach(edge => {
    const sourceGalaxy = starIndex.get(String(edge.source))?.galaxy;
    const targetGalaxy = starIndex.get(String(edge.target))?.galaxy;

    if (sourceGalaxy && targetGalaxy && sourceGalaxy !== targetGalaxy) {
      // Clé canonique (ordre alphabétique pour éviter doublons A->B et B->A)
      const key = [sourceGalaxy, targetGalaxy].sort().join('||');

      const existing = linkCounts.get(key);
      if (existing) {
        existing.count++;
        // Agréger les relationTypes
        if (edge.relationTypes) {
          edge.relationTypes.forEach(rt => existing.relationTypes.add(rt));
        }
      } else {
        linkCounts.set(key, {
          count: 1,
          relationTypes: new Set(edge.relationTypes || [])
        });
      }
    }
  });

  // Créer les liens avec poids minimum
  const MIN_WEIGHT = 3;
  const galaxyEdges: GraphLink[] = [];

  linkCounts.forEach((data, key) => {
    if (data.count >= MIN_WEIGHT) {
      const [source, target] = key.split('||');
      galaxyEdges.push({
        source,
        target,
        relType: `aggregated_${data.count}`,
        relationTypes: Array.from(data.relationTypes)
      });
    }
  });

  console.log(`[buildGalaxyEdges] ${galaxyEdges.length} liens inter-galaxies créés (min weight: ${MIN_WEIGHT})`);

  return galaxyEdges;
}
