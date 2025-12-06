// src/services/LemmaDataService.ts
/**
 * Lemma Data Service - Manages lemma-centric semantic atlas
 *
 * This service loads the lemma atlas and provides:
 * - Search by lemma (exact + prefix matching)
 * - BFS expansion to discover neighbor lemmas
 * - Efficient querying with pre-built indices
 */

import type {
  LemmaNode,
  LemmaEdge,
  LemmaAtlas,
  LemmaRawData,
  LemmaSearchParams,
  LemmaExpandResponse,
  GlobalPosition
} from '../types/lemma';

/**
 * Main service for lemma-centric data access
 */
export class LemmaDataService {
  private isInitialized = false;
  private data: LemmaRawData | null = null;

  /**
   * Initialize the service by loading the lemma atlas from /public/lemma-atlas.json
   */
  async initialize(): Promise<void> {
    if (this.isInitialized) return;

    console.log('[LOAD] Initializing LemmaDataService...');

    this.data = {
      lemmaNodes: new Map(),
      lemmaRelations: new Map(),
      lemmaPositions: new Map()
    };

    await this.loadLemmaAtlas();
    this.isInitialized = true;

    console.log(`[OK] LemmaDataService initialized:`, {
      lemmas: this.data.lemmaNodes.size,
      relations: this.data.lemmaRelations.size,
      positions: this.data.lemmaPositions.size
    });
  }

  /**
   * Load lemma atlas and build indices
   */
  private async loadLemmaAtlas(): Promise<void> {
    try {
      const response = await fetch('/lemma-atlas-complete.json');
      if (!response.ok) {
        throw new Error(`Failed to load lemma atlas: ${response.status}`);
      }

      const atlas: LemmaAtlas = await response.json();

      // Index nodes
      for (const node of atlas.nodes) {
        this.data!.lemmaNodes.set(node.lemma, node);
        this.data!.lemmaPositions.set(node.lemma, {
          x: node.x,
          y: node.y,
          z: node.z
        });
      }

      // Index edges (bidirectional for undirected graph)
      for (const edge of atlas.edges) {
        // Source -> Target
        if (!this.data!.lemmaRelations.has(edge.source)) {
          this.data!.lemmaRelations.set(edge.source, []);
        }
        this.data!.lemmaRelations.get(edge.source)!.push(edge);

        // Target -> Source (bidirectional)
        if (!this.data!.lemmaRelations.has(edge.target)) {
          this.data!.lemmaRelations.set(edge.target, []);
        }
        this.data!.lemmaRelations.get(edge.target)!.push({
          source: edge.target,
          target: edge.source,
          weight: edge.weight,
          relationTypes: edge.relationTypes
        });
      }

      console.log(`[ATLAS] Loaded lemma atlas: ${this.data!.lemmaNodes.size} lemmas, ${atlas.edges.length} edges`);
    } catch (error) {
      console.error('[ERROR] Failed to load lemma atlas:', error);
      throw error;
    }
  }

  /**
   * Search for lemmas by query string
   *
   * Uses exact match first, then prefix matching
   */
  searchLemmas(params: LemmaSearchParams): LemmaNode[] {
    this.ensureInitialized();

    if (!params.query) return [];

    const normalized = this.normalizeLemma(params.query);

    // Try exact match first
    const exactMatch = this.data!.lemmaNodes.get(normalized);
    if (exactMatch) {
      return this.filterResults([exactMatch], params);
    }

    // Prefix search
    const results: LemmaNode[] = [];
    for (const [lemma, node] of this.data!.lemmaNodes.entries()) {
      if (lemma.startsWith(normalized)) {
        results.push(node);

        if (results.length >= (params.limit || 100)) break;
      }
    }

    return this.filterResults(results, params);
  }

  /**
   * Expand a lemma node to discover neighbors via BFS
   *
   * @param lemma - The lemma to expand from
   * @param maxNodes - Maximum number of nodes to discover
   * @param maxDepth - Maximum BFS depth
   */
  expandLemma(
    lemma: string,
    maxNodes: number = 100,
    maxDepth: number = 2
  ): LemmaExpandResponse | null {
    this.ensureInitialized();

    const normalized = this.normalizeLemma(lemma);
    const centerNode = this.data!.lemmaNodes.get(normalized);

    if (!centerNode) {
      console.warn(`[EXPAND] Lemma not found: ${lemma}`);
      return null;
    }

    // BFS to discover neighbors
    const visited = new Set<string>([normalized]);
    const queue: Array<{ lemma: string; depth: number }> = [
      { lemma: normalized, depth: 0 }
    ];

    while (queue.length > 0 && visited.size < maxNodes) {
      const { lemma: currentLemma, depth } = queue.shift()!;

      if (depth >= maxDepth) continue;

      const edges = this.data!.lemmaRelations.get(currentLemma) || [];

      for (const edge of edges) {
        const neighborLemma = edge.target;

        if (visited.has(neighborLemma)) continue;

        visited.add(neighborLemma);
        queue.push({ lemma: neighborLemma, depth: depth + 1 });

        if (visited.size >= maxNodes) break;
      }
    }

    // Collect neighbor nodes
    const neighbors: LemmaNode[] = [];
    for (const visitedLemma of visited) {
      if (visitedLemma === normalized) continue; // Skip center

      const node = this.data!.lemmaNodes.get(visitedLemma);
      if (node) neighbors.push(node);
    }

    // Collect edges between visited nodes
    const relations: LemmaEdge[] = [];
    const seenEdges = new Set<string>();

    for (const visitedLemma of visited) {
      const edges = this.data!.lemmaRelations.get(visitedLemma) || [];

      for (const edge of edges) {
        if (!visited.has(edge.target)) continue;

        // Deduplicate (undirected graph)
        const key = [edge.source, edge.target].sort().join('||');
        if (seenEdges.has(key)) continue;

        seenEdges.add(key);
        relations.push(edge);
      }
    }

    console.log(`[EXPAND] ${lemma} → ${neighbors.length} neighbors, ${relations.length} edges (depth ${maxDepth})`);

    return {
      centerNode,
      neighbors,
      relations
    };
  }

  /**
   * Get a lemma node by its normalized name
   */
  getLemmaByName(lemma: string): LemmaNode | null {
    this.ensureInitialized();
    const normalized = this.normalizeLemma(lemma);
    return this.data!.lemmaNodes.get(normalized) || null;
  }

  /**
   * Get all edges for a lemma
   */
  getLemmaEdges(lemma: string): LemmaEdge[] {
    this.ensureInitialized();
    const normalized = this.normalizeLemma(lemma);
    return this.data!.lemmaRelations.get(normalized) || [];
  }

  /**
   * Normalize lemma for consistent lookup
   */
  private normalizeLemma(lemma: string): string {
    return lemma
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '') // Remove accents
      .replace(/[''`]/g, '')           // Remove apostrophes
      .replace(/\s+/g, '_')            // Spaces to underscores (multi-word lemmas)
      .trim();
  }

  /**
   * Filter search results by parameters
   */
  private filterResults(results: LemmaNode[], params: LemmaSearchParams): LemmaNode[] {
    let filtered = results;

    // Filter by POS
    if (params.pos) {
      filtered = filtered.filter(node =>
        node.synsets.some(s => s.pos === params.pos)
      );
    }

    // Filter by minimum sense count
    if (params.minSenseCount) {
      filtered = filtered.filter(node => node.senseCount >= params.minSenseCount!);
    }

    // Limit results
    if (params.limit && filtered.length > params.limit) {
      filtered = filtered.slice(0, params.limit);
    }

    return filtered;
  }

  /**
   * Ensure service is initialized
   */
  private ensureInitialized(): void {
    if (!this.isInitialized || !this.data) {
      throw new Error('LemmaDataService not initialized. Call initialize() first.');
    }
  }
}

/**
 * Global singleton instance
 */
export const lemmaDataService = new LemmaDataService();
