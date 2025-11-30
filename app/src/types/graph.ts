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
