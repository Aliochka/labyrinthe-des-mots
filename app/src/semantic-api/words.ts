// src/semantic-api/words.ts
import type {
  ExpandFromWordResult,
  ExpandOptions,
  FindPathBetweenWordsResult,
  PathOptions,
} from '../types/api';

// Fonction UX : expansion à partir d'un mot
export function expandFromWord(
  word: string,
  options: ExpandOptions = {}
): ExpandFromWordResult {
  // TODO: implémenter:
  // - normalisation du mot
  // - lookup dans l'index lexical
  // - gestion de la polysémie (AUTO, etc.)
  // - appel à expandFromSynset

  return {
    graph: null,
    senses: [],
    usedSynsetId: undefined,
    status: 'WORD_NOT_FOUND',
  };
}

// Fonction UX : chemin entre deux mots
export function findPathBetweenWords(
  wordA: string,
  wordB: string,
  options: PathOptions = {}
): FindPathBetweenWordsResult {
  // TODO: implémenter:
  // - résolution des sens pour A et B
  // - appel à findPathBetweenSynsets
  // - gestion des statuts

  return {
    status: 'NO_PATH',
    pathResult: {
      status: 'NO_PATH',
      paths: [],
      meta: { exploredNodes: 0, truncated: false },
    },
    sensesA: [],
    sensesB: [],
    usedSynsetA: undefined,
    usedSynsetB: undefined,
  };
}
