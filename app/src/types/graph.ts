// src/types/graph.ts

// Partie du discours (nom, verbe, adjectif)
export type PosTag = 'N' | 'V' | 'ADJ';

// Types de relations qu'on garde en V1
export type RelationType = 'HYPERNYM' | 'HYPONYM' | 'ANTONYM';

// Un synset (un "sens" de mot)
export interface ConceptNode {
  id: number;          // identifiant interne du synset
  pos: PosTag;         // 'N', 'V' ou 'ADJ'
  lemmas: string[];    // mots français associés à ce sens
  gloss?: string;      // petite définition (optionnelle)
}

// Une relation entre deux synsets
export interface RelationEdge {
  from: number;        // id synset source
  to: number;          // id synset cible
  type: RelationType;  // type de relation
}

// Un sous-graphe autour d'un centre
export interface GraphSlice {
  nodes: ConceptNode[];
  edges: RelationEdge[];
  centerId?: number;      // synsetId central (optionnel)
  depthExplored?: number; // profondeur atteinte
}

// Un chemin entre deux synsets
export interface Path {
  nodes: ConceptNode[];    // n0 -> n1 -> ... -> nk
  edges: RelationEdge[];   // relations correspondantes
}

// Statuts possibles pour la recherche de chemin
export type PathStatus =
  | 'OK'
  | 'NO_PATH'
  | 'START_OR_END_NOT_FOUND'
  | 'DEPTH_LIMIT_REACHED'
  | 'ERROR';

// Résultat de la recherche de chemin
export interface PathResult {
  status: PathStatus;
  paths?: Path[];
  meta?: {
    exploredNodes?: number;
    truncated?: boolean;
  };
}

// Types bas niveau pour les graphes 3D / multi-échelles

export interface GraphNode {
  id: string;
  name: string;
  x?: number;
  y?: number;
  z?: number;
  size?: number;
  color?: string;
  members?: string[]; // IDs des nœuds originaux (pour les clusters)
}

export interface GraphLink {
  source: string | number;
  target: string | number;
  relType?: string;
  relationTypes?: string[];  // Pour les liens de niveau planet avec types multiples
}

export interface GraphData {
  nodes: GraphNode[];
  links: GraphLink[];
}

export interface MultiScaleGraphLevel {
  id: string;
  minZoom: number;
  maxZoom: number;
  data: GraphData;
}

export interface MultiScaleGraph {
  levels: MultiScaleGraphLevel[];
}

// ===== NEW UNIVERSE SYSTEM (2 levels: galaxy + star) =====

// Level identifiers for the new 2-level system
export type LevelId = 'galaxy' | 'star';

// Galaxy node from universe.json
export interface GalaxyNode {
  id: string;          // ex: "gc_0"
  name: string;        // ex: "Droit & Loi"
  slug: string;        // ex: "droit_loi"
  confidence: number;  // ex: 0.6
  size: number;        // nombre d'étoiles
  x: number;
  y: number;
  z: number;
}

// Star node from universe.json
export interface StarNode {
  id: string;      // lemme (ex: "vie")
  galaxy: string;  // ID de la galaxie parente (ex: "gc_0")
  x: number;
  y: number;
  z: number;
}

// Structure of universe.json
export interface GalaxyBundleRoute {
  a: string;
  b: string;
  weight: number;
  points: number[][];  // Array de [x, y, z]
}

export interface UniverseData {
  meta: {
    galaxies: number;
    stars: number;
  };
  galaxies: GalaxyNode[];
  stars: StarNode[];
  bundles?: {                        // Optionnel pour rétrocompat
    galaxy?: {
      routes: GalaxyBundleRoute[];
    };
  };
}

// Unified graph data structure (replaces MultiScaleGraph legacy)
export interface UniverseGraphData {
  galaxies: {
    nodes: GraphNode[];
    links: GraphLink[];
  };
  stars: {
    nodes: GraphNode[];
    links: GraphLink[];
  };
  bundles?: {
    galaxy?: {
      routes: GalaxyBundleRoute[];
    };
  };
  // Performance indexes
  galaxyMembersMap: Map<string, string[]>;  // galaxyId -> starIds[]
  starIndex: Map<string, StarNode>;         // starId -> StarNode (O(1) lookup)
}
