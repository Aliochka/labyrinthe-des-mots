// src/types/api.ts
import type {
  ConceptNode,
  GraphSlice,
  PathResult,
  PosTag,
  RelationType,
} from './graph';

// Options pour l'expansion depuis un synset
export interface ExpandOptions {
  depth?: number;
  allowedRelationTypes?: RelationType[];
  maxNodes?: number;
  posFilter?: PosTag[];
}

// Résultat de expandFromWord
export type ExpandFromWordStatus =
  | 'OK'
  | 'WORD_NOT_FOUND'
  | 'AMBIGUOUS'
  | 'ERROR';

export interface ExpandFromWordResult {
  graph: GraphSlice | null;
  senses: ConceptNode[];     // sens possibles du mot
  usedSynsetId?: number;     // celui choisi (si OK)
  status: ExpandFromWordStatus;
}

// Options pour la recherche de chemin
export interface PathOptions {
  allowedRelationTypes?: RelationType[];
  maxDepth?: number;
  maxPaths?: number;
  strategy?: 'SHORTEST'; // on commence simple
}

// Résultat de findPathBetweenWords
export type FindPathBetweenWordsStatus =
  | 'OK'
  | 'WORD_NOT_FOUND'
  | 'AMBIGUOUS'
  | 'NO_PATH'
  | 'ERROR';

export interface FindPathBetweenWordsResult {
  status: FindPathBetweenWordsStatus;
  pathResult?: PathResult;
  sensesA?: ConceptNode[];
  sensesB?: ConceptNode[];
  usedSynsetA?: number;
  usedSynsetB?: number;
}
