// src/types/lemma.ts
/**
 * Type definitions for lemma-centric semantic atlas
 *
 * This architecture aggregates multiple synsets (word senses) into single lemma nodes,
 * providing a cleaner, more navigable semantic graph.
 */

/**
 * 3D position in the atlas
 */
export interface GlobalPosition {
  x: number;
  y: number;
  z: number;
}

/**
 * Lemma node aggregates all synsets that share the same French lemma
 *
 * Example: "vie" has 12 synsets (different senses), all combined into one LemmaNode
 */
export interface LemmaNode {
  /** Normalized French lemma (e.g., "vie") */
  lemma: string;

  /** All synsets belonging to this lemma */
  synsets: Array<{
    id: string;           // Original synset ID (e.g., "00006269-n")
    pos: string;          // Part of speech (n, v, a, r, s)
    gloss_fr: string;     // French definition
    gloss_en: string;     // English definition
  }>;

  /** ForceAtlas2 position for the merged lemma node */
  x: number;
  y: number;
  z: number;

  /** Total number of senses (synsets) for this lemma */
  senseCount: number;

  /** Total number of relations to other lemmas */
  relationCount: number;
}

/**
 * Edge between two lemma nodes with aggregated weight
 *
 * Example: If "vie" synset1 connects to "mort" synset1 AND "vie" synset2 connects to "mort" synset2,
 * this creates one LemmaEdge with weight=2
 */
export interface LemmaEdge {
  /** Source lemma */
  source: string;

  /** Target lemma */
  target: string;

  /** How many synset-to-synset connections exist between these lemmas */
  weight: number;

  /** All relation types involved (deduplicated) */
  relationTypes: string[];
}

/**
 * Complete lemma-centric atlas structure (JSON file format)
 */
export interface LemmaAtlas {
  nodes: LemmaNode[];
  edges: LemmaEdge[];
}

/**
 * Backend raw data structure for efficient querying
 */
export interface LemmaRawData {
  /** Map of lemma -> LemmaNode */
  lemmaNodes: Map<string, LemmaNode>;

  /** Map of lemma -> outgoing edges */
  lemmaRelations: Map<string, LemmaEdge[]>;

  /** Map of lemma -> 3D position */
  lemmaPositions: Map<string, GlobalPosition>;
}

/**
 * Search parameters for lemmas
 */
export interface LemmaSearchParams {
  /** Text query (will be normalized) */
  query?: string;

  /** Filter by part of speech */
  pos?: string;

  /** Minimum number of senses required */
  minSenseCount?: number;

  /** Maximum number of results */
  limit?: number;
}

/**
 * Expansion response when clicking a lemma
 */
export interface LemmaExpandResponse {
  /** The clicked lemma node */
  centerNode: LemmaNode;

  /** Neighboring lemma nodes (discovered via BFS) */
  neighbors: LemmaNode[];

  /** Deduplicated edges between lemmas in the subgraph */
  relations: LemmaEdge[];
}

/**
 * Local lemma node for frontend display (extends LemmaNode with UI state)
 */
export interface LocalLemmaNode extends LemmaNode {
  /** Display state */
  isCenter?: boolean;
  isNew?: boolean;
  isHighlighted?: boolean;
  isSelected?: boolean;

  /** Display properties */
  size?: number;
  color?: string;
}

/**
 * Local graph for 3D visualization
 */
export interface LocalLemmaGraph {
  nodes: LocalLemmaNode[];
  relations: LemmaEdge[];
}
